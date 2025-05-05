import { type Cursor, evmAddress, PageSize, type Post, postId, PostReactionType, PostReferenceType, PostType, txHash, type AnyPost, type Paginated, type UnexpectedError, type UnauthenticatedError, type ResultAsync } from "@lens-protocol/client";
import { fetchPost, fetchPostReactions, fetchPostReferences, fetchPosts, fetchWhoExecutedActionOnPost } from "@lens-protocol/client/actions";
import { client } from "./client";

const MAX_RETRIES = 3;
const MAX_BACKOFF_MS = 60000; // 60 seconds

type LensError = UnexpectedError | UnauthenticatedError;

async function withRetry<T>(operation: () => ResultAsync<T, LensError>): Promise<T> {
  let lastError: LensError | null = null;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    try {
      const result = await operation();
      if (result.isErr()) {
        lastError = result.error;
        attempt++;

        if (attempt === MAX_RETRIES) {
          break;
        }

        // Calculate exponential backoff with jitter
        const backoffMs = Math.min(
          (2 ** attempt) * 1000 + Math.random() * 1000,
          MAX_BACKOFF_MS
        );

        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }

      return result.value;
    } catch (error) {
      lastError = error as LensError;
      attempt++;

      if (attempt === MAX_RETRIES) {
        break;
      }

      // Calculate exponential backoff with jitter
      const backoffMs = Math.min(
        (2 ** attempt) * 1000 + Math.random() * 1000,
        MAX_BACKOFF_MS
      );

      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }
  }

  throw lastError;
}

export const fetchPostById = async (_postId: string) => {
  try {
    const result = await withRetry<AnyPost | null>(() => fetchPost(client, {
      post: postId(_postId),
    }));

    if (!result) {
      return null;
    }

    return result;
  } catch (error) {
    console.log(error);
    return null;
  }
};

export const fetchPostBy = async (_txHash: `0x${string}`): Promise<Post | undefined> => {
  const result = await withRetry<AnyPost | null>(() => fetchPost(client, {
    txHash: txHash(_txHash),
  }));

  if (!result) return;

  return result as Post;
};

export const fetchPostsBy = async (authorId: string, cursor?: Cursor | null) => {
  return await withRetry<Paginated<AnyPost>>(() => fetchPosts(client, {
    filter: {
      authors: [evmAddress(authorId)],
      postTypes: [PostType.Root, PostType.Comment],
      // feeds: [{ feed: evmAddress(LENS_BONSAI_DEFAULT_FEED) }]
    },
    pageSize: PageSize.Ten,
    cursor
  }));
};

export const fetchAllCommentsFor = async (_postId: string): Promise<Post[]> => {
  let allComments: Post[] = [];
  let nextPage: Cursor | undefined;

  do {
    const result = await withRetry<Paginated<AnyPost>>(() => fetchPostReferences(client, {
      referencedPost: postId(_postId),
      referenceTypes: [PostReferenceType.CommentOn],
      cursor: nextPage,
    }));

    allComments = [...allComments, ...result.items as Post[]];
    nextPage = result.pageInfo.next;
  } while (nextPage);

  return allComments;
}

export const fetchAllCollectorsFor = async (_postId: string, sorted = false): Promise<`0x${string}`[]> => {
  let allCollectors: { account: `0x${string}`; ts: string }[] = [];
  let nextPage: Cursor | undefined;

  do {
    const result = await withRetry<Paginated<{ account: { address: `0x${string}` }; firstAt: string }>>(() => fetchWhoExecutedActionOnPost(client, {
      post: postId(_postId)
    }));

    allCollectors = [...allCollectors, ...result.items.map((a) => ({ account: a.account.address, ts: a.firstAt }))];
    nextPage = result.pageInfo.next;
  } while (nextPage);

  if (!sorted) return allCollectors.map((a) => a.account);

  return allCollectors.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime()).map(a => a.account);
};

export const fetchAllUpvotersFor = async (_postId: string): Promise<`0x${string}`[]> => {
  let allUpvoters: `0x${string}`[] = [];
  let nextPage: Cursor | undefined;

  do {
    const result = await withRetry<Paginated<{ account: { address: `0x${string}` } }>>(() => fetchPostReactions(client, {
      post: postId(_postId),
      filter: {
        anyOf: [PostReactionType.Upvote]
      }
    }));

    allUpvoters = [...allUpvoters, ...result.items.map((a) => a.account.address)];
    nextPage = result.pageInfo.next;
  } while (nextPage);

  return allUpvoters;
};