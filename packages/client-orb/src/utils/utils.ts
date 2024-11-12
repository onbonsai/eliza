export const toHexString = (id: number) => {
    const profileHexValue = id.toString(16);
    return `0x${profileHexValue.length === 3 ? profileHexValue.padStart(4, "0") : profileHexValue.padStart(2, "0")}`;
  }
  
  export const bToHexString = (id: bigint) => {
    const profileHexValue = id.toString(16);
    return `0x${profileHexValue.length === 3 ? profileHexValue.padStart(4, "0") : profileHexValue.padStart(2, "0")}`;
  }
  
  // lens v2
  export const handleBroadcastResult = (broadcastResult: any) => {
    const broadcastValue = broadcastResult.unwrap();
  
    if ('id' in broadcastValue || 'txId' in broadcastValue) { // TODO: success?
      console.log(broadcastValue);
      return broadcastValue;
    } else {
      console.log(broadcastValue);
      throw new Error();
    }
  }