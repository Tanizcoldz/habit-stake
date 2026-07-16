"use client";

import React, { useState, useEffect, useCallback } from "react";
import { 
  Flame, 
  Award, 
  Zap, 
  CheckCircle, 
  Plus, 
  Clock, 
  Info, 
  ExternalLink,
  Wallet,
  Loader2,
  AlertCircle,
  Play
} from "lucide-react";
import confetti from "canvas-confetti";
import { ethers } from "ethers";
import styles from "./page.module.css";
import Mascot from "@/components/Mascot";

// Interface for onchain Habits
interface Habit {
  id: number;
  name: string;
  startTime: number; // unix timestamp in seconds
  durationInDays: number;
  dailyStake: string; // string representing MON amount (e.g. "0.1")
  totalStaked: string; // string representing MON amount
  checkInCount: number;
  lastCheckInTime: number; // unix timestamp in seconds
  claimed: boolean;
  checkInHistory: boolean[]; // array of flags for each day
}

// Contract configuration (reads from env, falls back to our latest testnet deployment)
const CONTRACT_ADDRESS = (process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "0x725dd18ce2cE42138e9B32085B718B750037F850").toLowerCase();

const MONAD_CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID || "0x8f"; // Default to Mainnet 143
const MONAD_PARAMS = {
  chainId: MONAD_CHAIN_ID,
  chainName: process.env.NEXT_PUBLIC_CHAIN_NAME || "Monad Mainnet",
  nativeCurrency: {
    name: "MON",
    symbol: "MON",
    decimals: 18
  },
  rpcUrls: [process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.monad.xyz/"],
  blockExplorerUrls: [process.env.NEXT_PUBLIC_EXPLORER_URL || "https://monadscan.com/"]
};

const explorerUrl = MONAD_PARAMS.blockExplorerUrls[0].replace(/\/$/, "");

// ABI for interacting with the HabitStake contract
const HABIT_STAKE_ABI = [
  "function nextHabitId() view returns (uint256)",
  "function createHabit(string name, uint256 durationInDays) payable",
  "function checkIn(uint256 habitId, string proof)",
  "function claimRefund(uint256 habitId)",
  "function getUserHabits(address user) view returns (uint256[] memory)",
  "function getHabitDetails(uint256 habitId) view returns (uint256 id, address ownerAddr, string name, uint256 startTime, uint256 durationInDays, uint256 dailyStake, uint256 totalStaked, uint256 checkInCount, uint256 lastCheckInTime, bool claimed, bool[] checkInHistory)",
  "function beneficiary() view returns (address)",
  "function owner() view returns (address)",
  "function feeBasisPoints() view returns (uint256)",
  "function accumulatedFees() view returns (uint256)",
  "function withdrawFees()",
  "function setFeeBasisPoints(uint256 _feeBasisPoints)",
  "function setBeneficiary(address _beneficiary)",
  "function transferOwnership(address newOwner)",
  "function paused() view returns (bool)",
  "function pause()",
  "function unpause()",
  "function MAX_DURATION_DAYS() view returns (uint256)",
  "function CLAIM_DEADLINE() view returns (uint256)",
  "function pendingWithdrawals(address) view returns (uint256)",
  "function withdrawEscrow()"
];

export default function Home() {
  // Wallet / Web3 Connection State
  const [walletConnected, setWalletConnected] = useState<boolean>(false);
  const [userAddress, setUserAddress] = useState<string>("");
  const [walletBalance, setWalletBalance] = useState<string>("0");
  const [isCorrectNetwork, setIsCorrectNetwork] = useState<boolean>(true);
  
  // Loading & Transaction States
  const [loadingHabits, setLoadingHabits] = useState<boolean>(false);
  const [txPending, setTxPending] = useState<boolean>(false);
  const [txMessage, setTxMessage] = useState<string>("");
  const [latestTxHash, setLatestTxHash] = useState<string>("");
  
  // Habits List from Contract
  const [habits, setHabits] = useState<Habit[]>([]);
  
  // Form input state
  const [habitName, setHabitName] = useState<string>("");
  const [duration, setDuration] = useState<number>(7);
  const [dailyStakeInput, setDailyStakeInput] = useState<string>("0.1");
  const [beneficiaryAddress, setBeneficiaryAddress] = useState<string>("");
  
  // Daily check-in proof submission
  const [checkInProofs, setCheckInProofs] = useState<Record<number, string>>({});
  const [activeProofInputHabitId, setActiveProofInputHabitId] = useState<number | null>(null);

  // Video Guide State
  const [showVideoGuide, setShowVideoGuide] = useState<boolean>(false);

  // Statistics
  const [stats, setStats] = useState({
    totalStaked: "0.00",
    completedCount: 0,
    refundsClaimed: "0.00",
    slashedAmount: "0.00"
  });

  // Admin & Protocol Fee States
  const [contractOwner, setContractOwner] = useState<string>("");
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [accumulatedFeesState, setAccumulatedFeesState] = useState<string>("0");
  const [currentFeeBP, setCurrentFeeBP] = useState<number>(250);
  const [newFeeBPInput, setNewFeeBPInput] = useState<string>("250");
  const [newBeneficiaryInput, setNewBeneficiaryInput] = useState<string>("");
  const [newOwnerInput, setNewOwnerInput] = useState<string>("");
  const [escrowBalance, setEscrowBalance] = useState<string>("0");

  // Check if wallet is connected and on correct network
  const checkWalletState = useCallback(async () => {
    if (typeof window !== "undefined" && (window as any).ethereum) {
      try {
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const accounts = await provider.send("eth_accounts", []);
        
        if (accounts.length > 0) {
          const address = accounts[0];
          setUserAddress(address);
          setWalletConnected(true);
          
          // Check chain
          const network = await provider.getNetwork();
          const chainIdHex = "0x" + network.chainId.toString(16);
          const correct = chainIdHex === MONAD_CHAIN_ID;
          setIsCorrectNetwork(correct);
          
          if (correct) {
            const balance = await provider.getBalance(address);
            setWalletBalance(parseFloat(ethers.formatEther(balance)).toFixed(3));
            loadOnchainData(address, provider);
          }
        } else {
          setWalletConnected(false);
          setUserAddress("");
          setHabits([]);
        }
      } catch (err) {
        console.error("Error reading wallet state:", err);
      }
    }
  }, []);

  // Switch network automatically or prompt user
  const handleSwitchNetwork = async () => {
    if (typeof window === "undefined" || !(window as any).ethereum) return;
    try {
      await (window as any).ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: MONAD_CHAIN_ID }],
      });
      checkWalletState();
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        try {
          await (window as any).ethereum.request({
            method: "wallet_addEthereumChain",
            params: [MONAD_PARAMS],
          });
          checkWalletState();
        } catch (addError) {
          console.error(`Error adding ${MONAD_PARAMS.chainName}:`, addError);
        }
      } else {
        console.error("Error switching network:", switchError);
      }
    }
  };

  // Connect Wallet
  const connectWallet = async () => {
    if (typeof window !== "undefined" && (window as any).ethereum) {
      try {
        const provider = new ethers.BrowserProvider((window as any).ethereum);
        const accounts = await provider.send("eth_requestAccounts", []);
        if (accounts.length > 0) {
          setUserAddress(accounts[0]);
          setWalletConnected(true);
          
          const network = await provider.getNetwork();
          const chainIdHex = "0x" + network.chainId.toString(16);
          const correct = chainIdHex === MONAD_CHAIN_ID;
          setIsCorrectNetwork(correct);
          
          if (correct) {
            const balance = await provider.getBalance(accounts[0]);
            setWalletBalance(parseFloat(ethers.formatEther(balance)).toFixed(3));
            loadOnchainData(accounts[0], provider);
          } else {
            await handleSwitchNetwork();
          }
        }
      } catch (err) {
        console.error("Wallet connection error:", err);
      }
    } else {
      alert("No Web3 wallet found. Please install MetaMask or Rabby.");
    }
  };

  // Load habits and stats directly from the Monad Contract
  const loadOnchainData = async (address: string, provider: ethers.BrowserProvider) => {
    setLoadingHabits(true);
    try {
      const contract = new ethers.Contract(CONTRACT_ADDRESS, HABIT_STAKE_ABI, provider);
      
      // Get beneficiary
      try {
        const benef = await contract.beneficiary();
        setBeneficiaryAddress(benef);
      } catch (e) {
        console.warn("Could not load beneficiary address");
      }

      // Get contract owner and admin status
      try {
        const contractOwnerAddr = await contract.owner();
        setContractOwner(contractOwnerAddr);
        const adminStatus = contractOwnerAddr.toLowerCase() === address.toLowerCase();
        setIsAdmin(adminStatus);
        
        if (adminStatus) {
          const fees = await contract.accumulatedFees();
          setAccumulatedFeesState(ethers.formatEther(fees));
          const feeBP = await contract.feeBasisPoints();
          setCurrentFeeBP(Number(feeBP));
        }
      } catch (e) {
        console.warn("Could not load owner/admin state", e);
      }

      // Get user's escrow balance (pending withdrawals)
      try {
        const pending = await contract.pendingWithdrawals(address);
        setEscrowBalance(ethers.formatEther(pending));
      } catch (e) {
        console.warn("Could not load escrow balance", e);
      }

      // Fetch user's list of habit IDs
      const habitIds: bigint[] = await contract.getUserHabits(address);
      const habitsList: Habit[] = [];
      
      let staked = 0;
      let completed = 0;
      let refunded = 0;
      let slashed = 0;
      const now = Math.floor(Date.now() / 1000);

      // Fetch details for each habit ID
      for (const id of habitIds) {
        const details = await contract.getHabitDetails(id);
        
        // Parse details returned from contract:
        // 0: id, 1: owner, 2: name, 3: startTime, 4: durationInDays, 5: dailyStake, 6: totalStaked, 7: checkInCount, 8: lastCheckInTime, 9: claimed, 10: checkInHistory
        const habitItem: Habit = {
          id: Number(details[0]),
          name: details[2],
          startTime: Number(details[3]),
          durationInDays: Number(details[4]),
          dailyStake: ethers.formatEther(details[5]),
          totalStaked: ethers.formatEther(details[6]),
          checkInCount: Number(details[7]),
          lastCheckInTime: Number(details[8]),
          claimed: details[9],
          checkInHistory: details[10]
        };
        
        habitsList.push(habitItem);

        // Stats calculations based on contract values
        const totalFloat = parseFloat(habitItem.totalStaked);
        const dailyFloat = parseFloat(habitItem.dailyStake);
        const elapsedDays = Math.floor((now - habitItem.startTime) / 86400);

        if (habitItem.claimed) {
          const refund = habitItem.checkInCount * dailyFloat;
          refunded += refund;
          slashed += (totalFloat - refund);
          completed++;
        } else {
          staked += totalFloat;
          if (elapsedDays >= habitItem.durationInDays) {
            completed++;
          }
        }
      }
      
      // Sort habits by ID descending (newest first)
      habitsList.sort((a, b) => b.id - a.id);
      setHabits(habitsList);
      
      setStats({
        totalStaked: staked.toFixed(2),
        completedCount: completed,
        refundsClaimed: refunded.toFixed(2),
        slashedAmount: slashed.toFixed(2)
      });
    } catch (err) {
      console.error("Error loading contract data:", err);
    } finally {
      setLoadingHabits(false);
    }
  };

  // Listeners for account/network changes
  useEffect(() => {
    checkWalletState();
    
    if (typeof window !== "undefined" && (window as any).ethereum) {
      const handleAccountsChanged = () => checkWalletState();
      const handleChainChanged = () => checkWalletState();

      (window as any).ethereum.on("accountsChanged", handleAccountsChanged);
      (window as any).ethereum.on("chainChanged", handleChainChanged);

      return () => {
        (window as any).ethereum.removeListener("accountsChanged", handleAccountsChanged);
        (window as any).ethereum.removeListener("chainChanged", handleChainChanged);
      };
    }
  }, [checkWalletState]);

  // Check current status of each day in history
  const getDayStatus = (habit: Habit, dayIndex: number) => {
    const now = Math.floor(Date.now() / 1000);
    const elapsedDays = Math.floor((now - habit.startTime) / 86400);

    if (dayIndex < elapsedDays) {
      return habit.checkInHistory[dayIndex] ? "SUCCESS" : "MISSED";
    } else if (dayIndex === elapsedDays) {
      if (habit.checkInHistory[dayIndex]) return "SUCCESS";
      if (elapsedDays >= habit.durationInDays) return "MISSED";
      return "CURRENT";
    } else {
      return "PENDING";
    }
  };

  const isCheckInAvailable = (habit: Habit) => {
    if (habit.claimed) return false;
    const now = Math.floor(Date.now() / 1000);
    const elapsedDays = Math.floor((now - habit.startTime) / 86400);
    if (elapsedDays >= habit.durationInDays) return false;
    return !habit.checkInHistory[elapsedDays];
  };

  const isRefundAvailable = (habit: Habit) => {
    if (habit.claimed) return false;
    const now = Math.floor(Date.now() / 1000);
    const elapsedDays = Math.floor((now - habit.startTime) / 86400);
    return elapsedDays >= habit.durationInDays;
  };

  // Onchain Create Habit Transaction
  const handleCreateHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletConnected || !isCorrectNetwork) return;
    if (!habitName.trim()) return;
    if (duration < 1 || duration > 365) {
      alert("Duration must be between 1 and 365 days.");
      return;
    }

    let valueWei: bigint;
    try {
      const dailyStakeWei = ethers.parseEther(dailyStakeInput);
      if (dailyStakeWei <= BigInt(0)) throw new Error();
      valueWei = dailyStakeWei * BigInt(duration);
    } catch {
      alert("Invalid daily stake.");
      return;
    }
    
    setTxPending(true);
    setTxMessage("Initializing Habit Stake contract creation...");
    setLatestTxHash("");

    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, HABIT_STAKE_ABI, signer);
      
      const tx = await contract.createHabit(habitName, duration, { value: valueWei });
      setLatestTxHash(tx.hash);
      setTxMessage("Transaction submitted. Waiting for Monad confirmation...");
      
      await tx.wait();
      
      setTxPending(false);
      setHabitName("");
      setDailyStakeInput("0.1");
      
      // Trigger celebration
      confetti({
        particleCount: 100,
        spread: 60,
        colors: ["#8354EC", "#6E54FF", "#C4B5FD", "#DDD7FE"]
      });

      // Reload onchain data
      loadOnchainData(userAddress, provider);
    } catch (err: any) {
      console.error(err);
      alert("Transaction failed: " + (err.reason || err.message));
      setTxPending(false);
    }
  };

  // Onchain Checkin Transaction
  const handleCheckInSubmit = async (habitId: number) => {
    const proofText = checkInProofs[habitId] || "";
    if (!proofText.trim()) {
      alert("Please provide some completion proof or link.");
      return;
    }

    setTxPending(true);
    setTxMessage("Signing daily check-in attestation...");
    setLatestTxHash("");

    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, HABIT_STAKE_ABI, signer);

      const tx = await contract.checkIn(habitId, proofText);
      setLatestTxHash(tx.hash);
      setTxMessage("Logging check-in on Monad L1...");

      await tx.wait();
      setTxPending(false);
      setActiveProofInputHabitId(null);

      confetti({
        particleCount: 80,
        spread: 70,
        colors: ["#8354EC", "#6E54FF", "#C4B5FD"]
      });

      loadOnchainData(userAddress, provider);
    } catch (err: any) {
      console.error(err);
      alert("Check-in failed: " + (err.reason || err.message));
      setTxPending(false);
    }
  };

  // Onchain Settle / Claim Refund Transaction
  const handleClaimRefund = async (habitId: number) => {
    setTxPending(true);
    setTxMessage("Claiming your refund and splitting slashes...");
    setLatestTxHash("");

    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, HABIT_STAKE_ABI, signer);

      const tx = await contract.claimRefund(habitId);
      setLatestTxHash(tx.hash);
      setTxMessage("Settling contract state...");

      await tx.wait();
      setTxPending(false);

      confetti({
        particleCount: 150,
        spread: 90,
        colors: ["#8354EC", "#6E54FF", "#C4B5FD"]
      });

      loadOnchainData(userAddress, provider);
    } catch (err: any) {
      console.error(err);
      alert("Settlement failed: " + (err.reason || err.message));
      setTxPending(false);
    }
  };

  const handleWithdrawFees = async () => {
    if (!walletConnected || !isCorrectNetwork || !isAdmin) return;
    
    setTxPending(true);
    setTxMessage("Withdrawing accumulated protocol fees...");
    setLatestTxHash("");
    
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, HABIT_STAKE_ABI, signer);
      
      const tx = await contract.withdrawFees();
      setLatestTxHash(tx.hash);
      setTxMessage("Withdrawing fees from contract...");
      
      await tx.wait();
      setTxPending(false);
      
      confetti({
        particleCount: 100,
        spread: 60,
        colors: ["#3B82F6", "#10B981", "#10B981"]
      });
      
      loadOnchainData(userAddress, provider);
    } catch (err: any) {
      console.error(err);
      alert("Withdrawal failed: " + (err.reason || err.message));
      setTxPending(false);
    }
  };

  const handleSetFeeBasisPoints = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletConnected || !isCorrectNetwork || !isAdmin) return;
    
    const feeBP = parseInt(newFeeBPInput);
    if (isNaN(feeBP) || feeBP < 0 || feeBP > 1000) {
      alert("Invalid fee percentage. Must be between 0% and 10% (0 and 1000 basis points).");
      return;
    }
    
    setTxPending(true);
    setTxMessage(`Updating protocol fee to ${(feeBP / 100).toFixed(2)}%...`);
    setLatestTxHash("");
    
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, HABIT_STAKE_ABI, signer);
      
      const tx = await contract.setFeeBasisPoints(feeBP);
      setLatestTxHash(tx.hash);
      
      await tx.wait();
      setTxPending(false);
      loadOnchainData(userAddress, provider);
    } catch (err: any) {
      console.error(err);
      alert("Update failed: " + (err.reason || err.message));
      setTxPending(false);
    }
  };

  const handleSetBeneficiary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletConnected || !isCorrectNetwork || !isAdmin) return;
    if (!ethers.isAddress(newBeneficiaryInput)) {
      alert("Invalid Ethereum address.");
      return;
    }
    
    setTxPending(true);
    setTxMessage("Updating beneficiary address...");
    setLatestTxHash("");
    
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, HABIT_STAKE_ABI, signer);
      
      const tx = await contract.setBeneficiary(newBeneficiaryInput);
      setLatestTxHash(tx.hash);
      
      await tx.wait();
      setTxPending(false);
      setNewBeneficiaryInput("");
      loadOnchainData(userAddress, provider);
    } catch (err: any) {
      console.error(err);
      alert("Update failed: " + (err.reason || err.message));
      setTxPending(false);
    }
  };

  const handleTransferOwnership = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletConnected || !isCorrectNetwork || !isAdmin) return;
    if (!ethers.isAddress(newOwnerInput)) {
      alert("Invalid Ethereum address.");
      return;
    }
    
    const confirmTransfer = confirm(`Are you sure you want to transfer contract ownership to ${newOwnerInput}? You will lose admin rights on this page!`);
    if (!confirmTransfer) return;

    setTxPending(true);
    setTxMessage("Transferring contract ownership...");
    setLatestTxHash("");
    
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, HABIT_STAKE_ABI, signer);
      
      const tx = await contract.transferOwnership(newOwnerInput);
      setLatestTxHash(tx.hash);
      
      await tx.wait();
      setTxPending(false);
      setNewOwnerInput("");
      loadOnchainData(userAddress, provider);
    } catch (err: any) {
      console.error(err);
      alert("Transfer failed: " + (err.reason || err.message));
      setTxPending(false);
    }
  };

  const handleWithdrawEscrow = async () => {
    if (!walletConnected || !isCorrectNetwork) return;
    
    setTxPending(true);
    setTxMessage("Withdrawing escrowed funds...");
    setLatestTxHash("");
    
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, HABIT_STAKE_ABI, signer);
      
      const tx = await contract.withdrawEscrow();
      setLatestTxHash(tx.hash);
      
      await tx.wait();
      setTxPending(false);
      
      confetti({
        particleCount: 100,
        spread: 60,
        colors: ["#10B981", "#3B82F6"]
      });
      
      loadOnchainData(userAddress, provider);
    } catch (err: any) {
      console.error(err);
      alert("Withdrawal failed: " + (err.reason || err.message));
      setTxPending(false);
    }
  };

  return (
    <div className={styles.dashboardContainer}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.logoArea}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="HabitStake Logo" style={{ height: "50px", display: "block" }} />
        </div>

        <div className={styles.controlsArea}>
          {walletConnected && (
            <div className={styles.networkIndicator}>
              <span className={`${styles.networkDot} ${isCorrectNetwork ? styles.networkDotConnected : ""}`} />
              <span>{isCorrectNetwork ? MONAD_PARAMS.chainName : "Unsupported Chain"}</span>
            </div>
          )}

          <button 
            className={`${styles.walletBtn} ${walletConnected && isCorrectNetwork ? styles.walletBtnConnected : ""}`}
            onClick={walletConnected ? undefined : connectWallet}
          >
            <Wallet size={16} />
            {walletConnected 
              ? `${userAddress.slice(0, 6)}...${userAddress.slice(-4)} (${walletBalance} MON)` 
              : "Connect Wallet"}
          </button>
        </div>
      </header>

      {/* Transaction status loading indicator */}
      {txPending && (
        <div className="glass" style={{ padding: "1rem", borderRadius: "12px", borderLeft: "4px solid var(--monad-purple-neon)", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <Loader2 className="animate-spin" style={{ color: "var(--monad-purple-neon)", animation: "spin 1s linear infinite" }} size={20} />
            <span style={{ fontWeight: 600 }}>{txMessage}</span>
          </div>
          {latestTxHash && (
            <a 
              href={`${explorerUrl}/tx/${latestTxHash}`}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: "0.8rem", color: "var(--monad-purple-light)", display: "flex", alignItems: "center", gap: "0.25rem", textDecoration: "underline", marginLeft: "2.1rem" }}
            >
              View on Monadscan <ExternalLink size={12} />
            </a>
          )}
        </div>
      )}

      {/* Keyframe animation for spinner */}
      <style jsx global>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Main onboarding overlay if wallet not connected */}
      {!walletConnected ? (
        <div style={{ width: "100%", maxWidth: "900px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <main className="glass" style={{ padding: "3rem 2.5rem", display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: "3rem", marginTop: "1rem", flexWrap: "wrap-reverse" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: "1", minWidth: "240px" }}>
              <Mascot pose="MAIN" size={230} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "1.5rem", flex: "1.2", minWidth: "300px", textAlign: "left" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="HabitStake Logo" style={{ height: "60px", display: "block", marginBottom: "0.25rem" }} />
              <h2 style={{ fontSize: "2rem", fontWeight: 900, lineHeight: 1.2 }}>Commit. Conquer. Onchain.</h2>
              <p style={{ color: "var(--text-secondary)", lineHeight: "1.6" }}>
                HabitStake forces discipline by backing your daily habits with locked token stakes on the high-speed Monad blockchain. Succeed daily to claim your refund—or watch your stake get slashed onchain!
              </p>
              <button className="glow-btn" style={{ padding: "1rem 2rem", fontSize: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }} onClick={connectWallet}>
                <Wallet size={18} />
                Connect Web3 Wallet
              </button>
            </div>
          </main>

          {/* Video Showcase Section */}
          <section className={`${styles.videoSection} glass ${styles.videoCard}`}>
            <div className={styles.videoHeader}>
              <div className={styles.videoTitleContainer}>
                <Play size={20} style={{ color: "var(--monad-purple-light)", fill: "currentColor" }} />
                <h3 className={styles.videoTitle}>Watch the Creature in Action</h3>
              </div>
              <span style={{ fontSize: "0.8rem", color: "var(--monad-purple-light)", fontWeight: 700, letterSpacing: "0.5px" }}>TUTORIAL GUIDE</span>
            </div>
            <p className={styles.videoDescription}>
              See how the HabitStake creature motivates your daily routine, how the smart contracts lock and release MON tokens, and how slashing keeps you accountable.
            </p>
            <div className={styles.videoWrapper}>
              <video 
                className={styles.videoPlayer}
                src="/use_the_creature_and_make_him.mp4"
                poster="/hero_thumbnail.png"
                controls
                preload="metadata"
                playsInline
              />
            </div>
          </section>
        </div>
      ) : !isCorrectNetwork ? (
        <main className="glass" style={{ padding: "4rem 2rem", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "1.5rem", marginTop: "1rem", maxWidth: "600px", margin: "2rem auto" }}>
          <AlertCircle style={{ color: "var(--monad-purple-neon)" }} size={64} />
          <h2 style={{ fontSize: "1.75rem", fontWeight: 800 }}>Wrong Network Connected</h2>
          <p style={{ color: "var(--text-secondary)", maxWidth: "450px", lineHeight: "1.6" }}>
            HabitStake operates strictly on the {MONAD_PARAMS.chainName} blockchain. Switch your active wallet network to proceed.
          </p>
          <button className="glow-btn" style={{ padding: "1rem 2rem", fontSize: "1rem" }} onClick={handleSwitchNetwork}>
            Switch to {MONAD_PARAMS.chainName}
          </button>
        </main>
      ) : (
        <>
          {/* Welcome Mascot Widget */}
          <div className="glass" style={{ display: "flex", alignItems: "center", gap: "1.5rem", padding: "1.25rem 1.5rem", background: "var(--bg-raised)", borderColor: "var(--border)" }}>
            <Mascot pose="LETSGO" size={60} />
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", flex: 1 }}>
              <div style={{ background: "var(--purple-muted)", color: "var(--purple-text)", border: "1px solid var(--border-accent)", padding: "0.6rem 1rem", fontSize: "0.85rem", fontFamily: "var(--font-mono)", fontWeight: 400, lineHeight: 1.5 }}>
                &quot;Don&apos;t just promise yourself&mdash;stake it to make it! Show me the proof of your daily grind or I&apos;m slashing your MON straight to the public goods pool.&quot;
              </div>
              <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginLeft: "0.5rem", fontFamily: "var(--font-mono)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>&mdash; HABITSTAKE MASCOT</span>
            </div>
          </div>

          {/* Dashboard Stats */}
          <section className={styles.statsRow}>
            <div className={`${styles.statCard} glass`}>
              <span className={styles.statLabel}>Active Staked Value</span>
              <span className={`${styles.statValue} text-gradient-cyan`}>
                {stats.totalStaked} MON
              </span>
            </div>
            <div className={`${styles.statCard} glass`}>
              <span className={styles.statLabel}>Refunds Claimed</span>
              <span className={styles.statValue} style={{ color: "var(--monad-purple-light)" }}>
                {stats.refundsClaimed} MON
              </span>
            </div>
            <div className={`${styles.statCard} glass`}>
              <span className={styles.statLabel}>Total Slashed</span>
              <span className={styles.statValue} style={{ color: "var(--text-muted)" }}>
                {stats.slashedAmount} MON
              </span>
            </div>
            <div className={`${styles.statCard} glass`}>
              <span className={styles.statLabel}>Completed Commitments</span>
              <span className={styles.statValue}>
                {stats.completedCount}
              </span>
            </div>
          </section>

          {/* Workspace grid */}
          <main className={styles.mainGrid}>
            {/* Left Column: Habits list & Secondary Grid */}
            <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
              <section className={styles.habitsSection}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Your Active Commitments</h2>
              </div>

              {loadingHabits ? (
                <div className={`${styles.emptyState} glass`} style={{ padding: "3rem" }}>
                  <Loader2 className="animate-spin" style={{ color: "var(--monad-purple-neon)", animation: "spin 1s linear infinite", marginBottom: "1rem" }} size={32} />
                  <h3>Reading Monad State...</h3>
                  <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Fetching active stakes and records from contract.</p>
                </div>
              ) : habits.length === 0 ? (
                <div className={`${styles.emptyState} glass`} style={{ padding: "3rem 2rem" }}>
                  <Mascot pose="PLAN" size={90} style={{ marginBottom: "0.5rem" }} />
                  <h3>No commitments created</h3>
                  <p>Deploy a contract stake to start tracking your daily loop on Monad.</p>
                </div>
              ) : (
                habits.map((habit) => {
                  const now = Math.floor(Date.now() / 1000);
                  const elapsedDays = Math.floor((now - habit.startTime) / 86400);
                  const daysLeft = Math.max(0, habit.durationInDays - elapsedDays);
                  const checkinAvailable = isCheckInAvailable(habit);
                  const refundAvailable = isRefundAvailable(habit);
                  
                  let badgeStatus = "active";
                  if (habit.claimed) badgeStatus = "claimed";
                  else if (refundAvailable) {
                    badgeStatus = habit.checkInCount === habit.durationInDays ? "success" : "failed";
                  }

                  return (
                    <div 
                      key={habit.id} 
                      className={`${styles.habitCard} glass-interactive ${habit.claimed ? styles.habitCardClaimed : ""}`}
                    >
                      {/* Habit Card Header */}
                      <div className={styles.habitCardHeader}>
                        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                          {badgeStatus === "active" && <Mascot pose="BUILD" size={40} />}
                          {badgeStatus === "claimed" && <Mascot pose="NICE" size={40} />}
                          {badgeStatus === "success" && <Mascot pose="WIN" size={42} />}
                          {badgeStatus === "failed" && <Mascot pose="REFLECT" size={45} />}
                          
                          <div className={styles.habitMeta}>
                            <h3 className={styles.habitName}>{habit.name}</h3>
                            <div className={styles.habitStakeInfo}>
                              Staked: {habit.totalStaked} MON • Daily: {habit.dailyStake} MON
                            </div>
                          </div>
                        </div>

                        <span className={`${styles.badge} ${
                          badgeStatus === "claimed" ? styles.badgeClaimed :
                          badgeStatus === "success" ? styles.badgeSuccess :
                          badgeStatus === "failed" ? styles.badgeFailed :
                          styles.badgeActive
                        }`}>
                          {badgeStatus}
                        </span>
                      </div>

                      {/* Calendar Dots */}
                      <div className={styles.historyWrapper}>
                        <span className={styles.historyTitle}>Commitment History</span>
                        <div className={styles.historyGrid}>
                          {Array.from({ length: habit.durationInDays }).map((_, idx) => {
                            const status = getDayStatus(habit, idx);
                            return (
                              <div 
                                key={idx}
                                className={`${styles.historyDot} ${
                                  status === "SUCCESS" ? styles.historyDotSuccess :
                                  status === "MISSED" ? styles.historyDotMissed :
                                  status === "CURRENT" ? styles.historyDotCurrent :
                                  styles.historyDotPending
                                }`}
                                title={`Day ${idx + 1}: ${status}`}
                              >
                                {status === "SUCCESS" ? "✓" : status === "MISSED" ? "✗" : idx + 1}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Card Footer Actions */}
                      <div className={styles.cardFooter}>
                        <div className={styles.daysLeft}>
                          <Clock size={14} />
                          {habit.claimed ? (
                            <span>Settled</span>
                          ) : daysLeft > 0 ? (
                            <span>{daysLeft} days remaining</span>
                          ) : (
                            <span>End of Stake Period</span>
                          )}
                        </div>

                        <div className={styles.footerActions}>
                          {checkinAvailable && activeProofInputHabitId !== habit.id && (
                            <button 
                              className={styles.checkinBtn}
                              onClick={() => setActiveProofInputHabitId(habit.id)}
                            >
                              <Zap size={14} />
                              Check In Today
                            </button>
                          )}

                          {checkinAvailable && activeProofInputHabitId === habit.id && (
                            <button 
                              className={styles.checkinBtn}
                              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid var(--border-color)" }}
                              onClick={() => setActiveProofInputHabitId(null)}
                            >
                              Cancel
                            </button>
                          )}

                          {!habit.claimed && habit.checkInHistory[elapsedDays] && (
                            <div className={styles.checkinBtnChecked} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                <CheckCircle size={14} />
                                Done for Today
                              </div>
                              <span style={{ fontSize: "0.65rem", opacity: 0.8, fontWeight: "normal" }}>
                                {(() => {
                                  const nextWindow = habit.startTime + ((elapsedDays + 1) * 86400);
                                  const diff = nextWindow - now;
                                  if (diff <= 0) return "Refresh to check in";
                                  const h = Math.floor(diff / 3600);
                                  const m = Math.floor((diff % 3600) / 60);
                                  return `Next window in ${h}h ${m}m`;
                                })()}
                              </span>
                            </div>
                          )}

                          {refundAvailable && !habit.claimed && (
                            <button 
                              className={styles.claimBtn}
                              onClick={() => handleClaimRefund(habit.id)}
                            >
                              <Award size={14} />
                              Claim Refund
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Inline Proof Form */}
                      {activeProofInputHabitId === habit.id && (
                        <div className={styles.proofSection}>
                          <span className={styles.proofHeader}>Submit Proof of Work URL or text</span>
                          <div className={styles.proofActions}>
                            <input 
                              type="text" 
                              placeholder="e.g. github commit link, or text log" 
                              className={`${styles.textInput} ${styles.proofInput}`}
                              value={checkInProofs[habit.id] || ""}
                              onChange={(e) => setCheckInProofs({
                                ...checkInProofs,
                                [habit.id]: e.target.value
                              })}
                            />
                            <button 
                              className={styles.checkinBtn}
                              onClick={() => handleCheckInSubmit(habit.id)}
                            >
                              Submit
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </section>


              <section className={styles.secondaryGrid}>
              
              {/* Achievements / Collectibles */}
              <div className="glass" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.2rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)" }}>
                    Trophy Room
                  </h3>
                  <button 
                    onClick={() => {
                      const text = `I'm locking in my daily habits on Monad with real skin-in-the-game! \n\nSo far I've staked ${stats.totalStaked} $MON and completed ${stats.completedCount} commitments on HabitStake. \n\nCheck it out: https://habitstaked.vercel.app/ @monad`;
                      window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
                    }}
                    style={{ background: "var(--purple-muted)", color: "var(--purple-text)", border: "1px solid var(--border-accent)", padding: "0.3rem 0.6rem", fontSize: "0.65rem", fontFamily: "var(--font-mono)", cursor: "pointer", borderRadius: "4px", fontWeight: 600, transition: "all 0.2s" }}
                    onMouseOver={(e) => (e.currentTarget.style.background = "var(--purple)")}
                    onMouseOut={(e) => (e.currentTarget.style.background = "var(--purple-muted)")}
                  >
                    Share to X
                  </button>
                </div>
                
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <div style={{ 
                    display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem", 
                    padding: "0.75rem", 
                    background: parseFloat(stats.totalStaked) > 0 ? "rgba(131, 84, 236, 0.1)" : "var(--bg-raised)",
                    border: parseFloat(stats.totalStaked) > 0 ? "1px solid var(--monad-purple-border)" : "1px solid var(--border)",
                    opacity: parseFloat(stats.totalStaked) > 0 ? 1 : 0.3,
                    borderRadius: "8px", textAlign: "center"
                  }}>
                    <Mascot pose="LETSGO" size={45} />
                    <span style={{ fontSize: "0.65rem", fontWeight: 700, color: parseFloat(stats.totalStaked) > 0 ? "var(--purple-text)" : "var(--text-muted)", textTransform: "uppercase" }}>Initiate</span>
                    <span style={{ fontSize: "0.55rem", color: "var(--text-secondary)" }}>Stake any MON</span>
                  </div>

                  <div style={{ 
                    display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem", 
                    padding: "0.75rem", 
                    background: stats.completedCount > 0 ? "rgba(16, 185, 129, 0.1)" : "var(--bg-raised)",
                    border: stats.completedCount > 0 ? "1px solid rgba(16, 185, 129, 0.3)" : "1px solid var(--border)",
                    opacity: stats.completedCount > 0 ? 1 : 0.3,
                    borderRadius: "8px", textAlign: "center"
                  }}>
                    <Mascot pose="WIN" size={45} />
                    <span style={{ fontSize: "0.65rem", fontWeight: 700, color: stats.completedCount > 0 ? "#10B981" : "var(--text-muted)", textTransform: "uppercase" }}>Discipline</span>
                    <span style={{ fontSize: "0.55rem", color: "var(--text-secondary)" }}>Finish 1 Habit</span>
                  </div>

                  <div style={{ 
                    display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem", 
                    padding: "0.75rem", 
                    background: parseFloat(stats.totalStaked) >= 10 ? "rgba(59, 130, 246, 0.1)" : "var(--bg-raised)",
                    border: parseFloat(stats.totalStaked) >= 10 ? "1px solid rgba(59, 130, 246, 0.3)" : "1px solid var(--border)",
                    opacity: parseFloat(stats.totalStaked) >= 10 ? 1 : 0.3,
                    borderRadius: "8px", textAlign: "center"
                  }}>
                    <Mascot pose="NICE" size={45} />
                    <span style={{ fontSize: "0.65rem", fontWeight: 700, color: parseFloat(stats.totalStaked) >= 10 ? "#3B82F6" : "var(--text-muted)", textTransform: "uppercase" }}>Whale</span>
                    <span style={{ fontSize: "0.55rem", color: "var(--text-secondary)" }}>Stake 10+ MON</span>
                  </div>

                  <div style={{ 
                    display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem", 
                    padding: "0.75rem", 
                    background: stats.completedCount >= 5 ? "rgba(245, 158, 11, 0.1)" : "var(--bg-raised)",
                    border: stats.completedCount >= 5 ? "1px solid rgba(245, 158, 11, 0.3)" : "1px solid var(--border)",
                    opacity: stats.completedCount >= 5 ? 1 : 0.3,
                    borderRadius: "8px", textAlign: "center"
                  }}>
                    <Mascot pose="FOCUS" size={45} />
                    <span style={{ fontSize: "0.65rem", fontWeight: 700, color: stats.completedCount >= 5 ? "#F59E0B" : "var(--text-muted)", textTransform: "uppercase" }}>Creature</span>
                    <span style={{ fontSize: "0.55rem", color: "var(--text-secondary)" }}>Finish 5 Habits</span>
                  </div>
                </div>
              </div>

              {/* Monad details */}
              <div className="glass" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                <h3 style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)" }}>Contract Deployment</h3>
                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: "1.5" }}>
                  Contract Address:
                  <code style={{ display: "block", background: "var(--bg)", border: "1px solid var(--border)", padding: "0.5rem", fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--purple-text)", marginTop: "0.25rem", wordBreak: "break-all" }}>
                    {CONTRACT_ADDRESS}
                  </code>
                </p>
                <a 
                  href={`${explorerUrl}/address/${CONTRACT_ADDRESS}`} 
                  target="_blank" 
                  rel="noreferrer"
                  style={{ fontSize: "0.85rem", color: "var(--monad-purple-light)", fontWeight: "600", display: "flex", alignItems: "center", gap: "0.3rem" }}
                >
                  View Contract on Monadscan <ExternalLink size={12} />
                </a>
              </div>

              {/* Video Tutorial Card */}
              <div className="glass" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", userSelect: "none" }} onClick={() => setShowVideoGuide(!showVideoGuide)}>
                  <h3 style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Play size={13} style={{ color: "var(--purple-text)", fill: "currentColor" }} />
                    Video Guide
                  </h3>
                  <span style={{ fontSize: "0.65rem", fontFamily: "var(--font-mono)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--purple-text)", background: "var(--purple-muted)", padding: "0.2rem 0.5rem", border: "1px solid var(--border-accent)", cursor: "pointer" }}>
                    {showVideoGuide ? "Hide" : "Show"}
                  </span>
                </div>
                {showVideoGuide && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", animation: "fadeIn 0.3s ease" }}>
                    <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: "1.5" }}>
                      Watch the creature guide to understand how checking in and slashing works:
                    </p>
                    <div className={styles.videoWrapper}>
                      <video 
                        className={styles.videoPlayer}
                        src="/use_the_creature_and_make_him.mp4"
                        poster="/hero_thumbnail.png"
                        controls
                        preload="metadata"
                        playsInline
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Escrow Balance Widget */}
              {parseFloat(escrowBalance) > 0 && (
                <div className="glass" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem", border: "1px solid var(--border-accent)", marginBottom: "1rem" }}>
                  <h3 style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--purple-text)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Zap size={13} />
                    Pending Escrow
                  </h3>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>Available to Pull:</span>
                    <span style={{ fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--purple-text)", fontSize: "1rem" }}>{escrowBalance} MON</span>
                  </div>
                  <button 
                    className="glow-btn"
                    style={{ width: "100%", justifyContent: "center", padding: "0.8rem", fontSize: "0.9rem" }}
                    disabled={txPending}
                    onClick={handleWithdrawEscrow}
                  >
                    Withdraw Escrow
                  </button>
                </div>
              )}

              {/* Admin Portal Card */}
              {isAdmin && (
                <div className="glass" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem", border: "1px solid var(--border-accent)" }}>
                  <h3 style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--purple-text)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Award size={13} />
                    Admin Portal
                  </h3>
                  
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", fontSize: "0.85rem" }}>
                    <div>
                      <span style={{ color: "var(--text-muted)", display: "block", fontFamily: "var(--font-mono)", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Contract Owner:</span>
                      <code style={{ display: "block", background: "var(--bg)", border: "1px solid var(--border)", padding: "0.4rem 0.6rem", fontSize: "0.72rem", fontFamily: "var(--font-mono)", color: "var(--text-muted)", overflowX: "auto" }}>
                        {contractOwner}
                      </code>
                    </div>

                    <div style={{ background: "var(--purple-muted)", border: "1px solid var(--border-accent)", padding: "0.75rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>Accumulated Fees:</span>
                        <span style={{ fontWeight: 700, fontFamily: "var(--font-mono)", color: "var(--purple-text)", fontSize: "1rem" }}>{accumulatedFeesState} MON</span>
                      </div>
                      <button 
                        className={styles.claimBtn}
                        style={{ width: "100%", justifyContent: "center", background: parseFloat(accumulatedFeesState) > 0 ? "var(--purple)" : "var(--bg-raised)", border: "1px solid var(--border)", color: parseFloat(accumulatedFeesState) > 0 ? "#fff" : "var(--text-muted)" }}
                        disabled={parseFloat(accumulatedFeesState) === 0 || txPending}
                        onClick={handleWithdrawFees}
                      >
                        Withdraw Fees
                      </button>
                    </div>

                    {/* Configure Fee */}
                    <form onSubmit={handleSetFeeBasisPoints} style={{ display: "flex", flexDirection: "column", gap: "0.4rem", borderTop: "1px solid var(--monad-purple-border)", paddingTop: "0.75rem" }}>
                      <label style={{ color: "var(--text-secondary)" }}>Protocol Fee (Current: {(currentFeeBP / 100).toFixed(2)}%)</label>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <input 
                          type="number"
                          min="0"
                          max="1000"
                          placeholder="e.g. 250 for 2.5%"
                          className={styles.textInput}
                          style={{ flex: 1, padding: "0.3rem 0.5rem", fontSize: "0.85rem" }}
                          value={newFeeBPInput}
                          onChange={(e) => setNewFeeBPInput(e.target.value)}
                          required
                        />
                        <button type="submit" className={styles.checkinBtn} style={{ padding: "0.4rem 0.8rem", fontSize: "0.8rem" }} disabled={txPending}>
                          Set Fee
                        </button>
                      </div>
                    </form>

                    {/* Configure Beneficiary */}
                    <form onSubmit={handleSetBeneficiary} style={{ display: "flex", flexDirection: "column", gap: "0.4rem", borderTop: "1px solid var(--monad-purple-border)", paddingTop: "0.75rem" }}>
                      <label style={{ color: "var(--text-secondary)" }}>Set Beneficiary Address</label>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <input 
                          type="text"
                          placeholder="0x..."
                          className={styles.textInput}
                          style={{ flex: 1, padding: "0.3rem 0.5rem", fontSize: "0.85rem" }}
                          value={newBeneficiaryInput}
                          onChange={(e) => setNewBeneficiaryInput(e.target.value)}
                          required
                        />
                        <button type="submit" className={styles.checkinBtn} style={{ padding: "0.4rem 0.8rem", fontSize: "0.8rem" }} disabled={txPending}>
                          Update
                        </button>
                      </div>
                    </form>

                    {/* Transfer Ownership */}
                    <form onSubmit={handleTransferOwnership} style={{ display: "flex", flexDirection: "column", gap: "0.4rem", borderTop: "1px solid var(--monad-purple-border)", paddingTop: "0.75rem" }}>
                      <label style={{ color: "var(--text-secondary)" }}>Transfer Ownership</label>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <input 
                          type="text"
                          placeholder="New Owner 0x..."
                          className={styles.textInput}
                          style={{ flex: 1, padding: "0.3rem 0.5rem", fontSize: "0.85rem" }}
                          value={newOwnerInput}
                          onChange={(e) => setNewOwnerInput(e.target.value)}
                          required
                        />
                        <button type="submit" className={styles.checkinBtn} style={{ padding: "0.4rem 0.8rem", fontSize: "0.8rem", background: "rgba(239, 68, 68, 0.2)", borderColor: "rgba(239, 68, 68, 0.4)" }} disabled={txPending}>
                          Transfer
                        </button>
                      </div>
                    </form>

                  </div>
                </div>
              )}
          </section>
            </div>

            {/* Right Column: Create Commitment Form */}
            <section style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              <form className={`${styles.createForm} glass`} onSubmit={handleCreateHabit}>
                <h2 className={styles.formTitle}>
                  <Plus size={14} style={{ color: "var(--purple)" }} />
                  Create Commitment
                </h2>

                <div className={styles.inputGroup}>
                  <label className={styles.inputLabel}>What is your daily habit?</label>
                  <input 
                    type="text"
                    placeholder="e.g. Gym 45 mins, Code 1 hour"
                    className={styles.textInput}
                    value={habitName}
                    onChange={(e) => setHabitName(e.target.value)}
                    required
                  />
                </div>

                <div className={styles.gridInputRow}>
                  <div className={styles.inputGroup}>
                    <label className={styles.inputLabel}>Duration</label>
                    <select 
                      className={styles.textInput}
                      value={duration}
                      onChange={(e) => setDuration(parseInt(e.target.value))}
                    >
                      <option value={5}>5 Days</option>
                      <option value={7}>7 Days</option>
                      <option value={14}>14 Days</option>
                      <option value={30}>30 Days</option>
                    </select>
                  </div>

                  <div className={styles.inputGroup}>
                    <label className={styles.inputLabel}>Daily Stake (MON)</label>
                    <input 
                      type="number"
                      step="0.01"
                      min="0.01"
                      className={styles.textInput}
                      value={dailyStakeInput}
                      onChange={(e) => setDailyStakeInput(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Total Stake Preview */}
                <div className={styles.stakePreview}>
                  <span className={styles.previewLabel}>Total Stake Locked</span>
                  <span className={styles.previewVal}>
                    {(parseFloat(dailyStakeInput || "0") * duration).toFixed(2)} MON
                  </span>
                </div>

                <div className={styles.infoBox}>
                  <Info className={styles.infoIcon} size={14} />
                  <span>
                    Your funds are held onchain by the HabitStake contract. Slashed funds go to beneficiary: {beneficiaryAddress ? `${beneficiaryAddress.slice(0, 8)}...${beneficiaryAddress.slice(-6)}` : "Loading..."}
                  </span>
                </div>

                <button 
                  type="submit" 
                  className="glow-btn submitBtn"
                  disabled={txPending}
                >
                  {txPending ? "Confirming tx..." : "Create Habit stake"}
                </button>
              </form>
            </section>
          </main>

          
        </>
      )}
    </div>
  );
}
