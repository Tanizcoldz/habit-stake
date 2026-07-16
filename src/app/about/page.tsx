import React from 'react';
import Link from 'next/link';
import { ShieldCheck, Cpu, Code2, Heart, ArrowLeft } from 'lucide-react';

export default function AboutPage() {
  return (
    <div style={{ minHeight: "100vh", position: "relative", overflow: "hidden", padding: "2rem", color: "var(--text-primary)" }}>


      <main style={{ maxWidth: "800px", margin: "0 auto", position: "relative", zIndex: 10, display: "flex", flexDirection: "column", gap: "2rem" }}>
        
        {/* Navigation */}
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", color: "var(--monad-purple-light)", textDecoration: "none", width: "fit-content" }}>
          <ArrowLeft size={16} /> Back to Dashboard
        </Link>

        {/* Header */}
        <div className="glass" style={{ padding: "3rem", borderRadius: "24px", textAlign: "center" }}>
          <h1 style={{ fontSize: "3rem", marginBottom: "1rem" }} className="text-gradient">How HabitStake Works</h1>
          <p style={{ fontSize: "1.1rem", color: "var(--text-secondary)", lineHeight: "1.6" }}>
            HabitStake is a fully decentralized, skin-in-the-game productivity platform built entirely on the Monad Mainnet.
          </p>
        </div>

        {/* Details Sections */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          
          <div className="glass" style={{ padding: "2rem", borderRadius: "16px" }}>
            <h2 style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem", color: "var(--monad-purple-neon)" }}>
              <ShieldCheck size={24} /> The Smart Contract
            </h2>
            <p style={{ color: "var(--text-secondary)", lineHeight: "1.7" }}>
              At its core, HabitStake runs on a highly optimized Solidity smart contract (`HabitStake.sol`). When you create a commitment, your MON tokens are securely locked in escrow. 
              The contract strictly enforces the 24-hour check-in window mathematically using `block.timestamp`. No admin can access or manipulate your staked funds while they are active.
            </p>
          </div>

          <div className="glass" style={{ padding: "2rem", borderRadius: "16px" }}>
            <h2 style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem", color: "var(--monad-purple-neon)" }}>
              <Cpu size={24} /> Slashing Mechanics
            </h2>
            <p style={{ color: "var(--text-secondary)", lineHeight: "1.7" }}>
              If you miss a daily check-in, the specific portion of your stake designated for that day is instantly calculated and flagged for slashing. When you finally claim your refund at the end of the duration, 
              the contract safely routes all slashed funds to the protocol beneficiary using a specialized "pull-pattern" escrow mechanism to prevent reentrancy and out-of-gas attacks.
            </p>
          </div>

          <div className="glass" style={{ padding: "2rem", borderRadius: "16px" }}>
            <h2 style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem", color: "var(--monad-purple-neon)" }}>
              <Code2 size={24} /> The Tech Stack
            </h2>
            <ul style={{ color: "var(--text-secondary)", lineHeight: "1.7", paddingLeft: "1.5rem" }}>
              <li><strong>Frontend:</strong> Next.js 14 App Router, React, CSS Modules</li>
              <li><strong>Web3 Integration:</strong> ethers.js v6</li>
              <li><strong>Smart Contracts:</strong> Solidity (EVM) deployed on Monad</li>
              <li><strong>UI/UX:</strong> Glassmorphism styling, CSS animations, and custom 3D rendering</li>
            </ul>
          </div>

        </div>

        {/* Footer */}
        <footer style={{ marginTop: "3rem", padding: "2rem", textAlign: "center", borderTop: "1px solid rgba(255,255,255,0.1)", color: "var(--text-secondary)" }}>
          <p style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", marginBottom: "1rem" }}>
            Built with <Heart size={16} style={{ color: "var(--danger)" }} /> by <a href="https://twitter.com/ritmir11" target="_blank" rel="noreferrer" style={{ color: "var(--monad-purple-light)", textDecoration: "none", fontWeight: "bold" }}>@ritmir11</a>
          </p>
          <p style={{ marginBottom: "0.5rem" }}>
            <a href="https://github.com/Tanizcoldz/habit-stake" target="_blank" rel="noreferrer" style={{ color: "var(--text-secondary)", textDecoration: "underline" }}>
              GitHub Repository
            </a>
          </p>
          <p style={{ fontSize: "0.85rem", opacity: 0.7 }}>
            &copy; 2026 HabitStake. All rights reserved.
          </p>
        </footer>

      </main>
    </div>
  );
}
