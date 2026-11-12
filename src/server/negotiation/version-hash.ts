import "server-only";
import { encodeAbiParameters, keccak256, parseAbiParameters, type Hex } from "viem";

const versionAbi = parseAbiParameters(
  "string, bytes16, bytes16, uint32, bytes16, bytes16, uint64, int64, int64, bool, string, (bytes16,uint32,string)[]",
);

function uuidBytes(id: string): Hex {
  return `0x${id.replaceAll("-", "").toLowerCase()}`;
}

type HashInput = {
  proposalId: string;
  versionId: string;
  version: number;
  demandItemId: string;
  sellerId: string;
  unitPriceVnd: bigint;
  handoffStartUs: bigint;
  handoffByUs: bigint;
  supportOffer: boolean;
  handoffPrivate: string;
  lines: readonly { membershipId: string; qty: number; note?: string | null }[];
};

export function hashNegotiationVersion(input: HashInput): Hex {
  const lines = input.lines.filter(line => line.qty > 0)
    .map(line => [uuidBytes(line.membershipId), line.qty, line.note ?? ""] as const)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);

  return keccak256(encodeAbiParameters(versionAbi, [
    "OOPS_NEGOTIATION_VERSION_V1",
    uuidBytes(input.proposalId),
    uuidBytes(input.versionId),
    input.version,
    uuidBytes(input.demandItemId),
    uuidBytes(input.sellerId),
    input.unitPriceVnd,
    input.handoffStartUs,
    input.handoffByUs,
    input.supportOffer,
    input.handoffPrivate,
    lines,
  ]));
}
