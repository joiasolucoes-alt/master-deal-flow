import type { User } from "@/data/types";

function normalizeText(value?: string | null) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function identityKey(value?: string | null) {
  return normalizeText(value)
    .replace(/\bjunior\b/g, "jr")
    .replace(/[^a-z0-9]/g, "");
}

function emailLocalPart(value?: string | null) {
  const normalized = normalizeText(value);
  if (!normalized.includes("@")) return "";
  return normalized.split("@")[0] ?? "";
}

function userCandidates(user: User) {
  return [user.name, user.email, emailLocalPart(user.email), user.id]
    .filter(Boolean)
    .flatMap((value) => [normalizeText(value), identityKey(value)])
    .filter(Boolean);
}

export function matchesUserIdentity(
  owner: string | null | undefined,
  user: User | null | undefined,
) {
  if (!owner || !user) return false;

  const ownerText = normalizeText(owner);
  const ownerKey = identityKey(owner);
  const ownerEmailLocal = emailLocalPart(owner);
  const ownerCandidates = [ownerText, ownerKey, identityKey(ownerEmailLocal)].filter(Boolean);
  const candidates = userCandidates(user);

  if (ownerCandidates.some((ownerCandidate) => candidates.includes(ownerCandidate))) return true;

  return ownerCandidates.some((ownerCandidate) =>
    candidates.some(
      (candidate) =>
        ownerCandidate.length >= 6 &&
        candidate.length >= 6 &&
        (ownerCandidate.includes(candidate) || candidate.includes(ownerCandidate)),
    ),
  );
}
