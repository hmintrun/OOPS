# Empirical Verification of TalentEscrowBounty.sol State Machine & Vulnerabilities

class TalentEscrowBountySimulator:
    def __init__(self):
        self.nextPoolId = 1
        self.pools = {}
        self.claimedTokenInPool = {} # poolId -> set(tokenIds)
        self.sbt_tokens = {} # tokenId -> {"owner": addr, "score": score, "track": track}
        self.balances = {} # addr -> AVAX balance
        self.contract_balance = 0

    def mint_sbt(self, candidate, tokenId, score, track):
        self.sbt_tokens[tokenId] = {"owner": candidate, "score": score, "track": track}

    def createBountyPool(self, sponsor, trackId, minScore, rewardPerCandidate, depositAmount):
        if depositAmount < rewardPerCandidate or rewardPerCandidate == 0:
            raise ValueError("ErrInsufficientDeposit")
        poolId = self.nextPoolId
        self.nextPoolId += 1
        self.pools[poolId] = {
            "sponsor": sponsor,
            "trackId": trackId,
            "minScore": minScore,
            "rewardPerCandidate": rewardPerCandidate,
            "totalRemainingFunds": depositAmount,
            "active": True
        }
        self.claimedTokenInPool[poolId] = set()
        self.contract_balance += depositAmount
        return poolId

    def claimBounty(self, caller, poolId, tokenId):
        pool = self.pools[poolId]
        if not pool["active"] or pool["totalRemainingFunds"] < pool["rewardPerCandidate"]:
            raise ValueError("ErrInsufficientDeposit")
        if tokenId in self.claimedTokenInPool[poolId]:
            raise ValueError("ErrBountyAlreadyClaimed")

        token = self.sbt_tokens.get(tokenId)
        if not token:
            raise ValueError("TokenDoesNotExist")
        if token["owner"] != caller:
            raise ValueError("ErrNotTokenOwner")
        if token["track"] != pool["trackId"] or token["score"] < pool["minScore"]:
            raise ValueError("ErrCriteriaNotMet")

        self.claimedTokenInPool[poolId].add(tokenId)
        pool["totalRemainingFunds"] -= pool["rewardPerCandidate"]
        self.contract_balance -= pool["rewardPerCandidate"]
        self.balances[caller] = self.balances.get(caller, 0) + pool["rewardPerCandidate"]
        return True

def run_tests():
    sim = TalentEscrowBountySimulator()
    sponsor = "0xSPONSOR"
    candidate = "0xCANDIDATE"

    # Sponsor creates a pool with 5 AVAX (1 AVAX reward per candidate)
    pool_id = sim.createBountyPool(sponsor, trackId=1, minScore=850, rewardPerCandidate=1.0, depositAmount=5.0)
    print(f"Pool {pool_id} created with 5.0 AVAX deposit.")

    # Vulnerability 1: Sybil Multi-SBT Pool Drain by single candidate
    # Candidate takes exam 5 times -> gets tokens 1, 2, 3, 4, 5
    for t_id in range(1, 6):
        sim.mint_sbt(candidate, t_id, score=920, track=1)
        sim.claimBounty(candidate, pool_id, t_id)
        print(f"Candidate claimed 1.0 AVAX using Token #{t_id}. Balance: {sim.balances[candidate]} AVAX")

    assert sim.balances[candidate] == 5.0
    print("=> VULNERABILITY CONFIRMED: Single candidate drained 100% of the pool using multiple SBTs!")

    # Vulnerability 2: Trapped leftover funds
    # New pool with deposit 2.5 AVAX, reward 1.0 AVAX
    pool_id_2 = sim.createBountyPool(sponsor, trackId=2, minScore=800, rewardPerCandidate=1.0, depositAmount=2.5)
    sim.mint_sbt("0xUSER2", 10, score=850, track=2)
    sim.mint_sbt("0xUSER3", 11, score=850, track=2)
    sim.claimBounty("0xUSER2", pool_id_2, 10)
    sim.claimBounty("0xUSER3", pool_id_2, 11)
    # Remaining: 0.5 AVAX
    print(f"Pool 2 remaining funds: {sim.pools[pool_id_2]['totalRemainingFunds']} AVAX")
    try:
        sim.mint_sbt("0xUSER4", 12, score=850, track=2)
        sim.claimBounty("0xUSER4", pool_id_2, 12)
    except ValueError as e:
        print(f"=> Next candidate cannot claim: {e}")
    print("=> VULNERABILITY CONFIRMED: 0.5 AVAX is permanently locked in contract with NO withdrawal function!")

if __name__ == "__main__":
    run_tests()
