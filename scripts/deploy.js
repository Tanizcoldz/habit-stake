const fs = require('fs');
const path = require('path');
const solc = require('solc');
const ethers = require('ethers');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

async function main() {
    console.log("Starting deployment process...");

    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        console.error("ERROR: Please add PRIVATE_KEY to your .env.local file.");
        process.exit(1);
    }

    const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;
    if (!rpcUrl) {
        console.error("ERROR: NEXT_PUBLIC_RPC_URL not found in .env.local.");
        process.exit(1);
    }

    // 1. Compile the contract
    console.log("Compiling HabitStake.sol...");
    const contractPath = path.join(__dirname, '..', 'contracts', 'HabitStake.sol');
    const sourceCode = fs.readFileSync(contractPath, 'utf8');

    const input = {
        language: 'Solidity',
        sources: {
            'HabitStake.sol': {
                content: sourceCode
            }
        },
        settings: {
            optimizer: {
                enabled: true,
                runs: 200
            },
            evmVersion: 'paris',
            outputSelection: {
                '*': {
                    '*': ['*']
                }
            }
        }
    };

    const output = JSON.parse(solc.compile(JSON.stringify(input)));
    
    if (output.errors) {
        const errors = output.errors.filter(e => e.severity === 'error');
        if (errors.length > 0) {
            console.error("Compilation Errors:", errors);
            process.exit(1);
        }
    }

    const contract = output.contracts['HabitStake.sol']['HabitStake'];
    const abi = contract.abi;
    const bytecode = contract.evm.bytecode.object;

    console.log("Compilation successful!");

    // 2. Connect to network
    console.log(`Connecting to network: ${rpcUrl}`);
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    
    let wallet;
    try {
        wallet = new ethers.Wallet(privateKey, provider);
        console.log(`Deployer address: ${wallet.address}`);
    } catch (e) {
        console.error("ERROR: Invalid private key.");
        process.exit(1);
    }

    // 3. Deploy
    console.log("Deploying contract (this may take a few seconds)...");
    const factory = new ethers.ContractFactory(abi, bytecode, wallet);
    
    // We pass the deployer address as the default beneficiary
    const beneficiaryAddress = wallet.address;
    
    const deployedContract = await factory.deploy(beneficiaryAddress);
    await deployedContract.waitForDeployment();
    
    const contractAddress = await deployedContract.getAddress();
    console.log(`\n🎉 Contract successfully deployed to: ${contractAddress}`);

    // 4. Update .env.local
    console.log("Updating .env.local with new contract address...");
    const envPath = path.join(__dirname, '..', '.env.local');
    let envContent = fs.readFileSync(envPath, 'utf8');
    
    // Replace the dummy address with the new one
    envContent = envContent.replace(
        /NEXT_PUBLIC_CONTRACT_ADDRESS=.*/, 
        `NEXT_PUBLIC_CONTRACT_ADDRESS=${contractAddress}`
    );
    
    fs.writeFileSync(envPath, envContent);
    console.log("✅ .env.local updated!");
    console.log("\nYou are all set! Restart your development server if needed and try the app again.");
}

main().catch(err => {
    console.error("DEPLOYMENT FAILED");
    fs.writeFileSync('err.json', JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
});
