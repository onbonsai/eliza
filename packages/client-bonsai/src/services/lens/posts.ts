import { type Cursor, type Post, postId, PostReactionType, PostReferenceType } from "@lens-protocol/client";
import { fetchPostReactions, fetchPostReferences, fetchWhoExecutedActionOnPost } from "@lens-protocol/client/actions";
import { client } from "./client";

export const fetchAllCommentsFor = async (_postId: string): Promise<Post[]> => {
  let allComments = [];
  let nextPage: Cursor;

  do {
    const result = await fetchPostReferences(client, {
      referencedPost: postId(_postId),
      referenceTypes: [PostReferenceType.CommentOn],
      cursor: nextPage,
    });

    if (result.isErr()) {
      return allComments;
    }

    allComments = [...allComments, ...result.value.items];
    nextPage = result.value.pageInfo.next;
  } while (nextPage);

  return allComments;
}

export const fetchAllCollectorsFor = async (_postId): Promise<`0x${string}`[]> => {
  let allCollectors = [];
  let nextPage: Cursor;

  do {
    const result = await fetchWhoExecutedActionOnPost(client, {
      post: postId(_postId)
    });

    if (result.isErr()) {
      return allCollectors;
    }

    allCollectors = [...allCollectors, ...result.value.items.map((a) => a.account.address)];
    nextPage = result.value.pageInfo.next;
  } while (nextPage);

  return allCollectors;
};

export const fetchAllUpvotersFor = async (_postId): Promise<`0x${string}`[]> => {
  let allUpvoters = [];
  let nextPage: Cursor;

  do {
    const result = await fetchPostReactions(client, {
      post: postId(_postId),
      filter: {
        anyOf: [PostReactionType.Upvote]
      }
    });

    if (result.isErr()) {
      return allUpvoters;
    }

    allUpvoters = [...allUpvoters, ...result.value.items.map((a) => a.account.address)];
    nextPage = result.value.pageInfo.next;
  } while (nextPage);

  return allUpvoters;
};