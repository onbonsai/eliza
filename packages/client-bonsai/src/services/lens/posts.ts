import { type Cursor, evmAddress, PageSize, type Post, postId, PostReactionType, PostReferenceType, PostType, txHash } from "@lens-protocol/client";
import { fetchPost, fetchPostReactions, fetchPostReferences, fetchPosts, fetchWhoExecutedActionOnPost } from "@lens-protocol/client/actions";
import { client } from "./client";

export const fetchPostById = async (_postId: string) => {
  try {
    const result = await fetchPost(client, {
      post: postId(_postId),
    });

    if (result.isErr()) {
      return console.error(result.error);
    }

    return result.value;
  } catch (error) {
    console.log(error);
    return null;
  }
};

export const fetchPostBy = async (_txHash: `0x${string}`): Promise<Post | undefined> => {
  const result = await fetchPost(client, {
    txHash: txHash(_txHash),
  });

  if (result.isErr()) return;

  return result?.value as Post;
};

export const fetchPostsBy = async (authorId: string, cursor?: Cursor | null) => {
  return await fetchPosts(client, {
    filter: {
      authors: [evmAddress(authorId)],
      postTypes: [PostType.Root, PostType.Comment],
      // feeds: [{ feed: evmAddress(LENS_BONSAI_DEFAULT_FEED) }]
    },
    pageSize: PageSize.Ten,
    cursor
  });
};

export const fetchAllCommentsFor = async (_postId: string): Promise<Post[]> => {
  let allComments: any[] = [];
  let nextPage: Cursor | undefined;

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

export const fetchAllCollectorsFor = async (_postId, sorted = false): Promise<`0x${string}`[]> => {
  let allCollectors: any[] = [];
  let nextPage: Cursor;

  do {
    const result = await fetchWhoExecutedActionOnPost(client, {
      post: postId(_postId)
    });

    if (result.isErr()) {
      return allCollectors;
    }

    allCollectors = [...allCollectors, ...result.value.items.map((a) => ({ account: a.account.address, ts: a.firstAt }))];
    nextPage = result.value.pageInfo.next;
  } while (nextPage);

  if (!sorted) return allCollectors.map((a) => a.account);

  return allCollectors.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()).map(a => a.account);
};

export const fetchAllUpvotersFor = async (_postId): Promise<`0x${string}`[]> => {
  let allUpvoters: any[] = [];
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