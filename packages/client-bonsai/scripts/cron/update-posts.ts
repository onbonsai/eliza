// ONLY NEEDED WHEN RUNNING THE SCRIPT LOCALLY
// import { config } from 'dotenv';
// import path from 'node:path';
// import { fileURLToPath } from 'node:url';
// config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env') });

import pLimit from 'p-limit';
import { getClient } from "../../src/services/mongo";
import { SmartMediaStatus } from '../../src/utils/types';

const BATCH_SIZE = 100;
const CONCURRENT_REQUESTS = 10;
const REQUEST_TIMEOUT = 30000; // 30 seconds

async function fetchWithTimeout(postId: string, apiKey: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(`${process.env.DOMAIN as string}/post/${postId}/update`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.text();
    console.log(`Successfully processed post ${postId}`);
    return result;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log(`Request timeout for post ${postId} after ${REQUEST_TIMEOUT}ms`);
    } else {
      console.log(`Error processing post ${postId}:`, error);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function processPosts(posts: string[]) {
  const apiKey = process.env.ISSUED_API_KEYS?.split(",")[0] as string;
  const limit = pLimit(CONCURRENT_REQUESTS);
  const startTime = Date.now();
  let successCount = 0;
  let failureCount = 0;

  console.log(`Starting to process ${posts.length} posts`);

  try {
    // Process posts concurrently with rate limiting
    const promises = posts.map(postId =>
      limit(async () => {
        try {
          await fetchWithTimeout(postId, apiKey);
          successCount++;
          return true;
        } catch {
          failureCount++;
          return false;
        }
      })
    );

    await Promise.allSettled(promises);

  } catch (error) {
    console.log('Fatal error in processPosts:', error);
  } finally {
    const duration = (Date.now() - startTime) / 1000;
    console.log(`
Processing completed:
- Total posts: ${posts.length}
- Successful: ${successCount}
- Failed: ${failureCount}
- Duration: ${duration.toFixed(2)}s
- Average time per post: ${(duration / posts.length).toFixed(2)}s
    `);
  }
}

async function processBatch(posts: string[]) {
  console.log(`Processing batch of ${posts.length} posts`);
  const startTime = Date.now();

  try {
    await processPosts(posts);
  } catch (error) {
    console.log('Error processing batch:', error);
  }

  const duration = (Date.now() - startTime) / 1000;
  console.log(`Batch completed in ${duration.toFixed(2)}s`);
}

// Helper function to fetch and process posts in batches
async function fetchAndProcessInBatches(mongo) {
  let totalProcessed = 0;

  // First, get total count for logging
  const totalCount = await mongo.media.countDocuments({ status: SmartMediaStatus.ACTIVE });
  console.log(`Found ${totalCount} total posts to process`);

  try {
    // Use cursor for memory-efficient processing of large result sets
    const cursor = mongo.media.find(
      { status: SmartMediaStatus.ACTIVE },
      { projection: { _id: 0, postId: 1 } }
    ).batchSize(BATCH_SIZE);

    let currentBatch: string[] = [];

    // Process each document from cursor
    for await (const doc of cursor) {
      if (doc.postId) {
        currentBatch.push(doc.postId);

        // When we hit batch size, process the batch
        if (currentBatch.length === BATCH_SIZE) {
          await processBatch(currentBatch);
          totalProcessed += currentBatch.length;
          console.log(`Progress: ${totalProcessed}/${totalCount} posts (${((totalProcessed / totalCount) * 100).toFixed(1)}%)`);
          currentBatch = []; // Reset batch
        }
      }
    }

    // Process any remaining posts
    if (currentBatch.length > 0) {
      await processBatch(currentBatch);
      totalProcessed += currentBatch.length;
      console.log(`Progress: ${totalProcessed}/${totalCount} posts (${((totalProcessed / totalCount) * 100).toFixed(1)}%)`);
    }

  } catch (error) {
    console.log('Error in batch processing:', error);
    throw error;
  }

  return totalProcessed;
}

// Main execution
async function main() {
  console.log("main()");
  let mongo;
  try {
    mongo = await getClient();
    const startTime = Date.now();
    console.log('Starting post update process');

    const totalProcessed = await fetchAndProcessInBatches(mongo);

    const duration = (Date.now() - startTime) / 1000;
    console.log(`
Processing completed:
- Total posts processed: ${totalProcessed}
- Total duration: ${duration.toFixed(2)}s
- Average time per post: ${(duration / totalProcessed).toFixed(2)}s
    `);

  } catch (error) {
    // console.log('Error in main execution:', error);
    console.log(error);
    process.exit(1);
  } finally {
    // Close MongoDB connection
    if (mongo) await mongo.client.close();
  }
}

// Execute the script
main();
