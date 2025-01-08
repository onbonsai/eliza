export const toHexString = (id: number) => {
    const profileHexValue = id.toString(16);
    return `0x${profileHexValue.length === 3 ? profileHexValue.padStart(4, "0") : profileHexValue.padStart(2, "0")}`;
};
