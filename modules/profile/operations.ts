import type { Address, AuthProvider, UserProfile } from "./types";

export function loginProfile(
  current: UserProfile | null,
  input: { name: string; email: string; provider: AuthProvider },
): UserProfile {
  return current
    ? { ...current, ...input, loggedIn: true }
    : {
        ...input,
        loggedIn: true,
        phone: "",
        addresses: [],
        preferredCategories: [],
        excludedAllergens: [],
      };
}

export function addProfileAddress(profile: UserProfile, address: Address): UserProfile {
  if (profile.addresses.some((current) => current.id === address.id)) {
    return profile;
  }
  const addresses = address.isDefault
    ? profile.addresses.map((current) => ({ ...current, isDefault: false }))
    : profile.addresses;
  return { ...profile, addresses: [...addresses, { ...address }] };
}

export function updateProfileAddress(
  profile: UserProfile,
  id: string,
  patch: Partial<Omit<Address, "id">>,
): UserProfile {
  if (!profile.addresses.some((address) => address.id === id)) {
    return profile;
  }
  return {
    ...profile,
    addresses: profile.addresses.map((address) =>
      address.id === id
        ? { ...address, ...patch }
        : patch.isDefault === true
          ? { ...address, isDefault: false }
          : address,
    ),
  };
}

export function removeProfileAddress(profile: UserProfile, id: string): UserProfile {
  return {
    ...profile,
    addresses: profile.addresses.filter((address) => address.id !== id),
  };
}

export function setDefaultProfileAddress(profile: UserProfile, id: string): UserProfile {
  if (!profile.addresses.some((address) => address.id === id)) {
    return profile;
  }
  return {
    ...profile,
    addresses: profile.addresses.map((address) => ({
      ...address,
      isDefault: address.id === id,
    })),
  };
}
