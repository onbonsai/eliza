import { StackClient } from '@stackso/js-core';
import { getProfileById } from './lens/profiles.ts';

const { STACK_API_KEY } = process.env;
const STACK_POINT_SYSTEM = 5946; // bons_ai

export const updatePoints = async (account: `0x${string}`, tag: string, points: number) => {
  const stack = new StackClient({ apiKey: STACK_API_KEY as string, pointSystemId: STACK_POINT_SYSTEM });
  await stack.track(tag, { account, points });
};

export const updatePointsWithProfileId = async (profileId: string, tag: string, points: number) => {
  const profile = await getProfileById(profileId);
  if (!profile) return;
  const stack = new StackClient({ apiKey: STACK_API_KEY as string, pointSystemId: STACK_POINT_SYSTEM });
  await stack.track(tag, { account: profile.ownedBy.address, points });
};