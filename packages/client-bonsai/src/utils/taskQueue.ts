class TaskQueue {
  private queue: { postId: string; task: () => Promise<any> }[] = [];
  private activeTaskCount = 0;  // Track number of currently running tasks
  private _isProcessing: Map<string, boolean> = new Map(); // Public mapping to track processing state by postId
  private static readonly MAX_CONCURRENT_TASKS = 10;

  async add<T>(postId: string, request: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        postId,
        task: async () => {
          try {
            this._isProcessing.set(postId, true);
            const result = await request();
            resolve(result);
            return result;
          } catch (error) {
            reject(error);
            throw error; // Re-throw to trigger the error handling in processQueue
          } finally {
            this._isProcessing.delete(postId);
          }
        }
      });
      this.processQueue(); // Try to process immediately
    });
  }

  isProcessing(postId: string): boolean {
    return !!this._isProcessing.get(postId);
  }

  private async processQueue(): Promise<void> {
    if (this.activeTaskCount >= TaskQueue.MAX_CONCURRENT_TASKS) {
      return; // Don't start new tasks if at capacity
    }

    while (this.queue.length > 0 && this.activeTaskCount < TaskQueue.MAX_CONCURRENT_TASKS) {
      const { postId, task } = this.queue.shift()!;
      this.activeTaskCount++;

      // Process task independently
      task()
        .catch(error => {
          console.error("Error processing request for postId:", postId, error);
          // Re-queue the task on failure
          this.queue.push({ postId, task });
          return this.exponentialBackoff(this.queue.length);
        })
        .finally(() => {
          this.activeTaskCount--;
          this.processQueue(); // Try to process more tasks when one finishes
        });
    }
  }

  private async exponentialBackoff(retryCount: number): Promise<void> {
    const delay = Math.pow(2, retryCount) * 1000;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

export default TaskQueue;