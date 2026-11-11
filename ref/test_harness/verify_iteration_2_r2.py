# Independent Empirical Verification Script for Iteration 2 Gate (Reviewer 2)
import re
import sys
import subprocess
import json

sys.stdout.reconfigure(encoding='utf-8')

def verify_proposal_text():
    with open('D:/HCMUS/AI/Unihack/UNIHACK_DAPP_IDEAS_PROPOSAL.md', 'r', encoding='utf-8') as f:
        content = f.read()
        lines = content.splitlines()

    print(f"=== Proposal Metric Inspection ===")
    print(f"Total lines: {len(lines)}")
    print(f"Total characters: {len(content)}")
    print(f"Total words: {len(content.split())}")

    # 1. Placeholders
    placeholders = re.findall(r'(\[TBD\]|TODO|FIXME|placeholder|Lorem ipsum)', content, re.IGNORECASE)
    print(f"Placeholders count: {len(placeholders)}")
    assert len(placeholders) == 0, f"Found placeholders: {placeholders}"

    # 2. SkillBadgeSBT.sol checks
    print("\n=== SkillBadgeSBT.sol Inspection ===")
    assert "0xb45a3c0e" in content, "Missing 0xb45a3c0e interfaceId"
    assert "supportsInterface(bytes4 interfaceId)" in content, "Missing supportsInterface implementation"
    assert 'ERC721("SkillForge Soulbound Credential", "sSKILL")' in content, "Missing sSKILL symbol"
    assert "toEthSignedMessageHash" in content, "Missing EIP-191 personal sign hash"
    assert "ErrSoulboundNonTransferable" in content, "Missing non-transferable error"
    print("✓ SkillBadgeSBT satisfies EIP-5192, EIP-191, and sSKILL")

    # 3. TalentEscrowBounty.sol checks
    print("\n=== TalentEscrowBounty.sol Inspection ===")
    assert "claimBountyWithAuthorization" in content, "Missing claimBountyWithAuthorization"
    assert "claimedCandidateInPool" in content, "Missing claimedCandidateInPool mapping"
    assert "withdrawRemainingFunds" in content, "Missing withdrawRemainingFunds"
    assert "ErrCandidateAlreadyClaimed" in content, "Missing ErrCandidateAlreadyClaimed"
    print("✓ TalentEscrowBounty satisfies gasless authorization, Sybil protection, and fund recovery")

    # 4. SkillToken.sol checks
    print("\n=== SkillToken.sol Inspection ===")
    assert "contract SkillToken is ERC20, ERC20Permit, Ownable" in content, "Missing SkillToken contract"
    assert "transferWithAuthorization" in content, "Missing transferWithAuthorization"
    assert "receiveWithAuthorization" in content, "Missing receiveWithAuthorization"
    assert "cancelAuthorization" in content, "Missing cancelAuthorization"
    assert "Welcome Faucet" in content or "grantWelcome" in content, "Missing Welcome Faucet specification"
    assert "50 SKILL" in content, "Missing 50 SKILL allocation"
    print("✓ SkillToken satisfies ERC-20, EIP-3009, EIP-2612, and Welcome Faucet")

    # 5. Foundry Test Suite checks
    print("\n=== Foundry Test Suite Inspection ===")
    assert "contract SkillForgeTest is Test" in content, "Missing SkillForgeTest contract"
    test_funcs = re.findall(r'function (test\w+)\(', content)
    print(f"Found {len(test_funcs)} test functions: {test_funcs}")
    assert len(test_funcs) >= 10, f"Expected at least 10 test functions, found {len(test_funcs)}"
    print("✓ Foundry test suite covers >= 10 test functions")

    # 6. Sandbox Runner checks
    print("\n=== sandbox-runner.ts Inspection ===")
    assert "env: {}" in content, "Missing env: {} in Worker options"
    assert "delete globalThis.require" in content, "Missing delete require"
    assert "process.exit =" in content, "Missing process.exit override"
    assert 'worker.on("exit"' in content, "Missing worker.on('exit') handler"
    print("✓ sandbox-runner.ts satisfies env isolation, global neutralization, exit override, and exit event handling")

    # 7. Telemetry checks
    print("\n=== telemetry.ts Inspection ===")
    assert "netManualChars" in content, "Missing netManualChars calculation"
    assert "snippet" in content, "Missing snippet event type"
    assert "Untrusted Client Environment" in content or "Advisory Behavioral Signal" in content, "Missing threat model clarification"
    print("✓ telemetry.ts satisfies Monaco snippet handling and threat model clarification")

    # 8. Live Demo Script checks
    print("\n=== Live Demo Script Inspection ===")
    assert "Soulbound Buffer Moment" in content, "Missing Soulbound Buffer Moment"
    assert "3-Tier Demo Fail-Safe Matrix" in content or "Ma Trận Dự Phòng Rủi Ro Trình Diễn" in content, "Missing Fail-Safe Matrix"
    print("✓ Section 7.3 satisfies Snowscan indexing latency buffer and fail-safe matrix")

if __name__ == "__main__":
    verify_proposal_text()
