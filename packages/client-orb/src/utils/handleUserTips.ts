const MAX_TIP_PER_DAY = 150;
const TIP_PER_RATING = {
  "8": 5,
  "9": 10,
  "10": 50
};

const handleUserTips = async (tips: any, rating: number, agentId: string, profileId: string): Promise<number> => {
  const userTips = await tips.findOne({ agentId, profileId });
  const currentTime = Date.now();
  const oneDayAgo = currentTime - (24 * 60 * 60 * 1000); // 24 hours ago in milliseconds

  let tipAmount = TIP_PER_RATING[rating.toString()];
  if (!userTips) {
    await tips.insertOne({
      agentId,
      profileId,
      amount: tipAmount,
      createdAt: currentTime,
      updatedAt: currentTime
    });
  } else if (userTips.createdAt >= oneDayAgo) {
    // If the record exists and is within the last 24 hours
    const potentialNewAmount = userTips.amount + tipAmount;
    if (potentialNewAmount <= MAX_TIP_PER_DAY) {
      // Update the record if the new amount doesn't exceed the max allowed per day
      await tips.updateOne(
        { agentId, profileId },
        { $set: { amount: potentialNewAmount, updatedAt: currentTime } }
      );
    } else {
      tipAmount = 0;
    }
  } else {
    // If the record exists but is older than 24 hours, reset the amount
    await tips.updateOne(
      { agentId, profileId },
      { $set: { amount: tipAmount, createdAt: currentTime, updatedAt: currentTime } }
    );
  }

  return tipAmount;
}

export default handleUserTips;