# Verification of Updated TalentEscrowBounty Logic (Reviewer 2)
import sys

sys.stdout.reconfigure(encoding='utf-8')

class UpdatedTalentEscrowBountySimulator:
    def __init__(self):
        self.nextPoolId = 1
        self.pools = {}
        self.claimedTokenInPool = {}     # poolId -> set(tokenIds)
        self.claimedCandidateInPool = {} # poolId -> set(candidates)
        self.sbt_tokens = {}             # tokenId -> {"owner": addr, "score": score, "track": track}
        self.balances = {}               # addr -> AVAX balance
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
        self.claimedCandidateInPool[poolId] = set()
        self.contract_balance += depositAmount
        self.balances[sponsor] = self.balances.get(sponsor, 10.0) - depositAmount
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
        
        # SYBIL RESISTANCE CHECK
        if caller in self.claimedCandidateInPool[poolId]:
            raise ValueError("ErrCandidateAlreadyClaimed")

        if token["track"] != pool["trackId"] or token["score"] < pool["minScore"]:
            raise ValueError("ErrCriteriaNotMet")

        self.claimedTokenInPool[poolId].add(tokenId)
        self.claimedCandidateInPool[poolId].add(caller)
        pool["totalRemainingFunds"] -= pool["rewardPerCandidate"]
        self.contract_balance -= pool["rewardPerCandidate"]
        self.balances[caller] = self.balances.get(caller, 0) + pool["rewardPerCandidate"]
        return True

    def claimBountyWithAuthorization(self, relayer, poolId, tokenId, candidate_signer):
        pool = self.pools[poolId]
        if not pool["active"] or pool["totalRemainingFunds"] < pool["rewardPerCandidate"]:
            raise ValueError("ErrInsufficientDeposit")
        if tokenId in self.claimedTokenInPool[poolId]:
            raise ValueError("ErrBountyAlreadyClaimed")

        token = self.sbt_tokens.get(tokenId)
        if not token:
            raise ValueError("TokenDoesNotExist")
        candidate = token["owner"]
        
        # Verify candidate signature
        if candidate_signer != candidate:
            raise ValueError("ErrInvalidSignature")

        # SYBIL RESISTANCE CHECK
        if candidate in self.claimedCandidateInPool[poolId]:
            raise ValueError("ErrCandidateAlreadyClaimed")

        if token["track"] != pool["trackId"] or token["score"] < pool["minScore"]:
            raise ValueError("ErrCriteriaNotMet")

        self.claimedTokenInPool[poolId].add(tokenId)
        self.claimedCandidateInPool[poolId].add(candidate)
        pool["totalRemainingFunds"] -= pool["rewardPerCandidate"]
        self.contract_balance -= pool["rewardPerCandidate"]
        # Direct transfer to candidate, NOT relayer!
        self.balances[candidate] = self.balances.get(candidate, 0) + pool["rewardPerCandidate"]
        return True

    def withdrawRemainingFunds(self, caller, poolId):
        pool = self.pools[poolId]
        if caller != pool["sponsor"]:
            raise ValueError("ErrNotPoolSponsor")
        if not pool["active"]:
            raise ValueError("ErrPoolInactive")
        
        remaining = pool["totalRemainingFunds"]
        if remaining == 0:
            raise ValueError("ErrInsufficientDeposit")

        # CEI pattern
        pool["totalRemainingFunds"] = 0
        pool["active"] = False
        self.contract_balance -= remaining
        self.balances[caller] = self.balances.get(caller, 0) + remaining
        return remaining

def run_tests():
    print("=== TESTING REMEDIATED TALENT ESCROW BOUNTY STATE MACHINE ===")
    sim = UpdatedTalentEscrowBountySimulator()
    sponsor = "0xSPONSOR"
    candidate = "0xCANDIDATE"
    relayer = "0xRELAYER"

    # Sponsor creates pool with 5 AVAX, reward 1.0 AVAX
    pool_id = sim.createBountyPool(sponsor, trackId=1, minScore=850, rewardPerCandidate=1.0, depositAmount=5.0)
    print(f"Pool {pool_id} created with 5 AVAX.")

    # Mint Token 1 for candidate
    sim.mint_sbt(candidate, 1, score=920, track=1)
    sim.claimBounty(candidate, pool_id, 1)
    print(f"Candidate claimed 1.0 AVAX with Token 1. Balance: {sim.balances[candidate]} AVAX")
    assert sim.balances[candidate] == 1.0

    # Mint Token 2 for same candidate -> try to claim again (Sybil attack)
    sim.mint_sbt(candidate, 2, score=950, track=1)
    try:
        sim.claimBounty(candidate, pool_id, 2)
        print("❌ FAIL: Candidate drained pool twice!")
        sys.exit(1)
    except ValueError as e:
        print(f"✓ PASS: Sybil drain blocked with {e}")
        assert str(e) == "ErrCandidateAlreadyClaimed"

    # Also test that Relayer authorization claim is blocked for duplicate candidate
    try:
        sim.claimBountyWithAuthorization(relayer, pool_id, 2, candidate_signer=candidate)
        print("❌ FAIL: Gasless authorized claim bypassed Sybil protection!")
        sys.exit(1)
    except ValueError as e:
        print(f"✓ PASS: Gasless authorized claim also blocked with {e}")
        assert str(e) == "ErrCandidateAlreadyClaimed"

    # Test fund recovery (withdrawRemainingFunds)
    print("\n--- Testing Sponsor Fund Recovery ---")
    sponsor_bal_before = sim.balances[sponsor]
    rem = sim.withdrawRemainingFunds(sponsor, pool_id)
    print(f"Sponsor withdrew remaining {rem} AVAX.")
    assert rem == 4.0
    assert sim.balances[sponsor] == sponsor_bal_before + 4.0
    assert sim.pools[pool_id]["active"] == False
    assert sim.pools[pool_id]["totalRemainingFunds"] == 0
    print("✓ PASS: Sponsor recovered all remaining 4.0 AVAX, pool marked inactive.")

    # Verify new candidate cannot claim on closed pool
    sim.mint_sbt("0xNEW_CANDIDATE", 3, score=900, track=1)
    try:
        sim.claimBounty("0xNEW_CANDIDATE", pool_id, 3)
        print("❌ FAIL: Candidate claimed from closed pool!")
        sys.exit(1)
    except ValueError as e:
        print(f"✓ PASS: Claim on inactive pool rejected with {e}")

    print("\n=== ALL ESCROW VERIFICATIONS PASSED SUCCESSFULLY ===")

if __name__ == "__main__":
    run_tests()
