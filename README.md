# HabitStake

**HabitStake** is a Web3 productivity platform built on Monad where you lock up crypto as a financial commitment to building daily habits. 

## Hackathon Submission Details

- **Name:** HabitStake
- **Description:** A Web3 productivity DApp that forces you to put your money where your mouth is. Stake MON to lock in your daily habits, and get slashed if you miss a day.
- **Problem:** Building new habits is difficult because existing habit-tracking apps lack real skin-in-the-game. If you miss a day on a standard Web2 tracker, nothing happens—there are no real consequences for procrastination, so users easily fall off the wagon.
- **Solution:** HabitStake solves this by introducing financial stakes on the Monad network. You define a habit (e.g., "Gym for 45 mins"), set a duration (e.g., 7 days), and lock up a daily stake of MON. Every day you check in on-chain, you secure your funds. If you miss a day, that day's stake is permanently slashed and sent to the protocol beneficiary. The very real pain of losing money forces users to stick to their commitments.
- **Project URL:** *(Add your hosted Vercel/Railway link here)*
- **Github repo:** [https://github.com/Tanizcoldz/habit-stake](https://github.com/Tanizcoldz/habit-stake) | Gitlab: [https://gitlab.com/tanizcoldz/habit-stake](https://gitlab.com/tanizcoldz/habit-stake)
- **Category:** Monad Testnet
- **Contract address:** `0x725dd18ce2cE42138e9B32085B718B750037F850` (Deployed on Monad Testnet)
- **Demo video:** *(Upload `public/use_the_creature_and_make_him.mp4` to YouTube/Twitter and paste the URL here)*
- **Post URL:** *(Link to your X/Twitter post)*

## Features

- **True On-Chain Accountability:** Habit state, check-ins, and fund custody are all handled securely by the `HabitStake.sol` smart contract on Monad.
- **Strict Slashing Mechanics:** If you miss a 24-hour window, the contract mathematically prevents you from recovering that day's stake. 
- **Admin Portal & Protocol Fees:** An exclusive owner portal allows for real-time adjustments to protocol fee percentages and beneficiary addresses, ensuring a sustainable platform model.

## Setup Instructions

1. Clone the repository:
```bash
git clone https://github.com/Tanizcoldz/habit-stake.git
cd habit-stake
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env.local` file in the root directory (make sure it matches `.env.example` if available, or simply use the default Monad testnet config). The deployed contract is hardcoded in the UI to fall back safely if no ENV is provided.

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) and connect your MetaMask or Rabby wallet (ensure it is configured to the Monad Testnet).

## Smart Contract

The core logic resides in `contracts/HabitStake.sol`. You can use `scripts/deploy.js` to compile and deploy new versions of the contract via `ethers.js` and `solc`.
