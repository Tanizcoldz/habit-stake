// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title HabitStake
 * @dev A commitment device smart contract. Users stake Monad tokens ($MON) on a daily habit.
 * Complete the habit and check-in daily to reclaim your stake. Slashed stakes are sent to a beneficiary.
 * Includes a protocol fee structure, secure owner withdrawals, reentrancy protections,
 * emergency pause mechanism, gas-safe duration caps, and beneficiary transfer protection.
 */
contract HabitStake {
    struct Habit {
        uint256 id;
        address owner;
        string name;
        uint256 startTime;
        uint256 durationInDays;
        uint256 dailyStake; // amount per day in wei
        uint256 totalStaked;
        uint256 checkInCount;
        uint256 lastCheckInTime;
        bool claimed;
        bool[] checkInHistory; // size = durationInDays, true if checked in for that day
    }

    // Contract governance and fee configurations
    address public owner;
    address public beneficiary;
    uint256 public nextHabitId;
    uint256 public feeBasisPoints = 250; // 2.5% default fee (100 = 1%)
    uint256 public accumulatedFees; // accumulated fees in wei
    
    // Security: max duration cap to prevent gas griefing via oversized checkInHistory arrays
    uint256 public constant MAX_DURATION_DAYS = 365;

    // Security: claim deadline — users must claim within this window after habit ends
    uint256 public constant CLAIM_DEADLINE = 180 days;

    // Emergency pause state
    bool public paused;
    
    // Reentrancy state
    bool private locked;

    // Beneficiary failed transfer escrow — pull pattern fallback
    mapping(address => uint256) public pendingWithdrawals;

    mapping(uint256 => Habit) public habits;
    mapping(address => uint256[]) public userHabits;

    // Events
    event HabitCreated(
        uint256 indexed habitId, 
        address indexed owner, 
        string name, 
        uint256 durationInDays, 
        uint256 dailyStake
    );
    event CheckedIn(uint256 indexed habitId, uint256 dayIndex, string proof);
    event HabitClaimed(uint256 indexed habitId, uint256 refundAmount, uint256 slashedAmount);
    event BeneficiaryChanged(address indexed oldBeneficiary, address indexed newBeneficiary);
    event FeesWithdrawn(address indexed owner, uint256 amount);
    event FeeBasisPointsChanged(uint256 oldFeeBP, uint256 newFeeBP);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);
    event Paused(address indexed by);
    event Unpaused(address indexed by);
    event SlashEscrowDeposited(address indexed beneficiary, uint256 amount);
    event EscrowWithdrawn(address indexed to, uint256 amount);

    // Modifiers
    modifier onlyOwner() {
        require(msg.sender == owner, "Not contract owner");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    modifier nonReentrant() {
        require(!locked, "ReentrancyGuard: reentrant call");
        locked = true;
        _;
        locked = false;
    }

    constructor(address _beneficiary) {
        require(_beneficiary != address(0), "Invalid beneficiary address");
        beneficiary = _beneficiary;
        owner = msg.sender;
    }

    // ═══════════════════════════════════════════════════════════
    //  CORE FUNCTIONS
    // ═══════════════════════════════════════════════════════════

    /**
     * @notice Create a new habit commitment and stake MON.
     * @param name The name of the habit (e.g. "Leetcode 1 Problem", "Gym 45 minutes")
     * @param durationInDays Number of days for the commitment (max 365)
     */
    function createHabit(string calldata name, uint256 durationInDays) external payable whenNotPaused {
        require(durationInDays > 0, "Duration must be at least 1 day");
        require(durationInDays <= MAX_DURATION_DAYS, "Duration exceeds maximum of 365 days");
        require(msg.value > 0, "Must stake some MON");
        require(msg.value % durationInDays == 0, "Total stake must be divisible by duration");
        
        uint256 dailyStake = msg.value / durationInDays;
        uint256 habitId = nextHabitId++;
        
        Habit storage habit = habits[habitId];
        habit.id = habitId;
        habit.owner = msg.sender;
        habit.name = name;
        habit.startTime = block.timestamp;
        habit.durationInDays = durationInDays;
        habit.dailyStake = dailyStake;
        habit.totalStaked = msg.value;
        habit.checkInCount = 0;
        habit.lastCheckInTime = 0;
        habit.claimed = false;
        
        // Initialize checkInHistory array
        for (uint256 i = 0; i < durationInDays; i++) {
            habit.checkInHistory.push(false);
        }

        userHabits[msg.sender].push(habitId);

        emit HabitCreated(habitId, msg.sender, name, durationInDays, dailyStake);
    }

    /**
     * @notice Helper to calculate the current day index since the habit started.
     */
    function getDayIndex(uint256 habitId) public view returns (uint256) {
        Habit memory habit = habits[habitId];
        if (block.timestamp < habit.startTime) return 0;
        return (block.timestamp - habit.startTime) / 1 days;
    }

    /**
     * @notice Check-in for the current day, providing text/url proof.
     * @param habitId ID of the habit
     * @param proof Description or link containing proof of completion
     */
    function checkIn(uint256 habitId, string calldata proof) external whenNotPaused {
        Habit storage habit = habits[habitId];
        require(msg.sender == habit.owner, "Not habit owner");
        require(!habit.claimed, "Habit already claimed");
        
        uint256 dayIndex = getDayIndex(habitId);
        require(dayIndex < habit.durationInDays, "Habit duration has ended");
        require(!habit.checkInHistory[dayIndex], "Already checked in for today");
        
        habit.checkInHistory[dayIndex] = true;
        habit.checkInCount++;
        habit.lastCheckInTime = block.timestamp;

        emit CheckedIn(habitId, dayIndex, proof);
    }

    /**
     * @notice Claim back staked MON for completed days. Slashes missed days to beneficiary.
     * Applies protocol fee and transfers net amounts using reentrancy-safe call method.
     * Must be called within 180 days after the habit ends to prevent indefinite fund locking.
     * If the beneficiary rejects the transfer, slashed funds are held in escrow (pull pattern).
     * @param habitId ID of the habit
     */
    function claimRefund(uint256 habitId) external nonReentrant {
        Habit storage habit = habits[habitId];
        require(msg.sender == habit.owner, "Not habit owner");
        require(!habit.claimed, "Already claimed");
        
        uint256 dayIndex = getDayIndex(habitId);
        require(dayIndex >= habit.durationInDays, "Habit duration has not ended yet");

        // Enforce claim deadline to prevent indefinite fund locking
        uint256 habitEndTime = habit.startTime + (habit.durationInDays * 1 days);
        require(block.timestamp <= habitEndTime + CLAIM_DEADLINE, "Claim deadline has passed");
        
        habit.claimed = true;
        
        uint256 refundAmount = habit.checkInCount * habit.dailyStake;
        uint256 slashedAmount = habit.totalStaked - refundAmount;

        // Apply protocol fees (default 2.5%)
        uint256 refundFee = (refundAmount * feeBasisPoints) / 10000;
        uint256 netRefund = refundAmount - refundFee;

        uint256 slashFee = (slashedAmount * feeBasisPoints) / 10000;
        uint256 netSlashed = slashedAmount - slashFee;

        accumulatedFees += (refundFee + slashFee);
        
        // Transfer refund to habit owner
        if (netRefund > 0) {
            (bool success, ) = payable(habit.owner).call{value: netRefund}("");
            require(success, "Refund transfer failed");
        }
        
        // Transfer slashed funds to beneficiary — use pull pattern fallback
        // if beneficiary is a contract that rejects ETH, escrow it instead of reverting
        if (netSlashed > 0) {
            (bool success, ) = payable(beneficiary).call{value: netSlashed}("");
            if (!success) {
                // Escrow the funds so the user's claim doesn't permanently revert
                pendingWithdrawals[beneficiary] += netSlashed;
                emit SlashEscrowDeposited(beneficiary, netSlashed);
            }
        }
        
        emit HabitClaimed(habitId, netRefund, netSlashed);
    }

    /**
     * @notice Allow beneficiary (or anyone with pending funds) to withdraw escrowed slash funds.
     * This is the pull-pattern fallback for when a beneficiary contract rejects direct transfers.
     */
    function withdrawEscrow() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "No escrowed funds");
        pendingWithdrawals[msg.sender] = 0;

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Escrow withdrawal failed");

        emit EscrowWithdrawn(msg.sender, amount);
    }

    // ═══════════════════════════════════════════════════════════
    //  ADMIN / OWNER FUNCTIONS
    // ═══════════════════════════════════════════════════════════

    /**
     * @notice Withdraw collected protocol fees to the owner.
     */
    function withdrawFees() external onlyOwner nonReentrant {
        uint256 amount = accumulatedFees;
        require(amount > 0, "No fees to withdraw");
        accumulatedFees = 0;
        
        (bool success, ) = payable(owner).call{value: amount}("");
        require(success, "Fee withdrawal failed");
        
        emit FeesWithdrawn(owner, amount);
    }

    /**
     * @notice Set a new fee percentage in basis points (100 = 1%, max is 1000 = 10% for security).
     */
    function setFeeBasisPoints(uint256 _feeBasisPoints) external onlyOwner {
        require(_feeBasisPoints <= 1000, "Fee cannot exceed 10%");
        uint256 oldFee = feeBasisPoints;
        feeBasisPoints = _feeBasisPoints;
        emit FeeBasisPointsChanged(oldFee, _feeBasisPoints);
    }

    /**
     * @notice Set a new beneficiary address for slashed stakes.
     */
    function setBeneficiary(address _beneficiary) external onlyOwner {
        require(_beneficiary != address(0), "Invalid beneficiary address");
        address oldBeneficiary = beneficiary;
        beneficiary = _beneficiary;
        emit BeneficiaryChanged(oldBeneficiary, _beneficiary);
    }

    /**
     * @notice Transfer contract ownership to a new address.
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner address");
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    /**
     * @notice Emergency pause — stops new habit creation and check-ins.
     * Claims are NOT paused so users can always withdraw their funds.
     */
    function pause() external onlyOwner {
        require(!paused, "Already paused");
        paused = true;
        emit Paused(msg.sender);
    }

    /**
     * @notice Unpause the contract to resume normal operations.
     */
    function unpause() external onlyOwner {
        require(paused, "Not paused");
        paused = false;
        emit Unpaused(msg.sender);
    }

    // ═══════════════════════════════════════════════════════════
    //  VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════

    /**
     * @notice Get list of habit IDs owned by a user.
     */
    function getUserHabits(address user) external view returns (uint256[] memory) {
        return userHabits[user];
    }

    /**
     * @notice Get complete details of a habit.
     */
    function getHabitDetails(uint256 habitId) external view returns (
        uint256 id,
        address ownerAddr,
        string memory name,
        uint256 startTime,
        uint256 durationInDays,
        uint256 dailyStake,
        uint256 totalStaked,
        uint256 checkInCount,
        uint256 lastCheckInTime,
        bool claimed,
        bool[] memory checkInHistory
    ) {
        Habit memory habit = habits[habitId];
        return (
            habit.id,
            habit.owner,
            habit.name,
            habit.startTime,
            habit.durationInDays,
            habit.dailyStake,
            habit.totalStaked,
            habit.checkInCount,
            habit.lastCheckInTime,
            habit.claimed,
            habit.checkInHistory
        );
    }
}
