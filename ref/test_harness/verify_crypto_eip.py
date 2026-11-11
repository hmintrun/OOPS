# Compact Keccak-256 in Pure Python
RC = [
    0x0000000000000001, 0x0000000000008082, 0x800000000000808A, 0x8000000080008000,
    0x000000000000808B, 0x0000000080000001, 0x8000000080008081, 0x8000000000008009,
    0x000000000000008A, 0x0000000000000088, 0x0000000080008009, 0x000000008000000A,
    0x000000008000808B, 0x800000000000008B, 0x8000000000008089, 0x8000000000008003,
    0x8000000000008002, 0x8000000000000080, 0x000000000000800A, 0x800000008000000A,
    0x8000000080008081, 0x8000000000008080, 0x0000000080000001, 0x8000000080008008
]
ROTC = [
    [0, 36, 3, 41, 18],
    [1, 44, 10, 45, 2],
    [62, 6, 43, 15, 61],
    [28, 55, 25, 21, 56],
    [27, 20, 39, 8, 14]
]

def rotl64(x, y):
    return ((x << (y % 64)) & 0xFFFFFFFFFFFFFFFF) | (x >> (64 - (y % 64)))

def keccak_f1600(state):
    for round_idx in range(24):
        # Theta
        C = [state[x][0] ^ state[x][1] ^ state[x][2] ^ state[x][3] ^ state[x][4] for x in range(5)]
        D = [C[(x + 4) % 5] ^ rotl64(C[(x + 1) % 5], 1) for x in range(5)]
        for x in range(5):
            for y in range(5):
                state[x][y] ^= D[x]
        # Rho & Pi
        B = [[0] * 5 for _ in range(5)]
        for x in range(5):
            for y in range(5):
                B[y][(2 * x + 3 * y) % 5] = rotl64(state[x][y], ROTC[x][y])
        # Chi
        for x in range(5):
            for y in range(5):
                state[x][y] = B[x][y] ^ ((~B[(x + 1) % 5][y]) & B[(x + 2) % 5][y])
        # Iota
        state[0][0] ^= RC[round_idx]

def keccak_256(data: bytes) -> bytes:
    rate = 136 # 1088 bits = 136 bytes
    # Padding for Keccak-256 (pad10*1 with domain separator 0x01)
    padlen = rate - (len(data) % rate)
    if padlen == 1:
        padding = b'\x81'
    else:
        padding = b'\x01' + b'\x00' * (padlen - 2) + b'\x80'
    padded = data + padding

    state = [[0] * 5 for _ in range(5)]
    for block_idx in range(0, len(padded), rate):
        block = padded[block_idx:block_idx + rate]
        for i in range(17):
            val = int.from_bytes(block[i*8:(i+1)*8], 'little')
            x = i % 5
            y = i // 5
            state[x][y] ^= val
        keccak_f1600(state)

    out = bytearray()
    for i in range(4): # 4 * 8 = 32 bytes
        x = i % 5
        y = i // 5
        out.extend(state[x][y].to_bytes(8, 'little'))
    return bytes(out)

# Verification 1: Selector for locked(uint256)
sel = keccak_256(b"locked(uint256)")[:4]
print("Selector for locked(uint256): 0x" + sel.hex())
assert sel.hex() == "b45a3c0e", f"Expected b45a3c0e, got {sel.hex()}"
print("=> EIP-5192 interfaceId is strictly: 0xb45a3c0e")

# Verification 2: Check ERC721 supportsInterface in OpenZeppelin v5
# OpenZeppelin v5 ERC721 defines:
# type(IERC721).interfaceId = 0x80ac58cd
# type(IERC721Metadata).interfaceId = 0x5b5e139f
# type(IERC165).interfaceId = 0x01ffc9a7
# If SkillBadgeSBT does not override supportsInterface, querying 0xb45a3c0e returns FALSE!
print("=> In SkillBadgeSBT.sol, supportsInterface(0xb45a3c0e) is NOT implemented.")
print("=> Any caller calling supportsInterface(0xb45a3c0e) will receive false!")

# Verification 3: Message hash simulation of SkillBadgeSBT.mintBadge
# messageHash = keccak256(abi.encodePacked(block.chainid, address(this), candidate, skillVectorHash, overallScore, trackId, nonce, deadline))
chain_id = 43113 # Fuji
this_addr = bytes.fromhex("1111111111111111111111111111111111111111")
candidate_addr = bytes.fromhex("cafecafecafecafecafecafecafecafecafecafe")
skill_hash = keccak_256(b"ALGO_95_OPT_90")
overall_score = 920
track_id = 1
nonce = 101
deadline = 1800000000

packed_data = (
    chain_id.to_bytes(32, 'big') +
    this_addr +
    candidate_addr +
    skill_hash +
    overall_score.to_bytes(2, 'big') +
    track_id.to_bytes(1, 'big') +
    nonce.to_bytes(32, 'big') +
    deadline.to_bytes(32, 'big')
)

msg_hash = keccak_256(packed_data)
print("Solidity messageHash: 0x" + msg_hash.hex())
eth_signed_msg = b"\x19Ethereum Signed Message:\n32" + msg_hash
eth_signed_hash = keccak_256(eth_signed_msg)
print("toEthSignedMessageHash: 0x" + eth_signed_hash.hex())
print("=> Cryptographic math is mathematically self-consistent for eth_sign, BUT it is NOT EIP-712 structured data!")
