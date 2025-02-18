class TaskQueue {
  private queue: { postId: string; task: () => Promise<any> }[] = [];
  private processing = false;
  private _isProcessing: Map<string, boolean> = new Map(); // Public mapping to track processing state by postId
  private static readonly MAX_CONCURRENT_TASKS = 10;

  async add<T>(postId: string, request: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        postId, task: async () => {
          try {
            this._isProcessing.set(postId, true); // Mark as processing
            const result = await request();
            resolve(result);
          } catch (error) {
            reject(error);
          } finally {
            this._isProcessing.delete(postId);
          }
        }
      });
      this.processQueue();
    });
  }

  isProcessing(postId: string): boolean {
    return !!this._isProcessing.get(postId)
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }
    this.processing = true;

    const processingTasks = [];
    while (this.queue.length > 0 && processingTasks.length < TaskQueue.MAX_CONCURRENT_TASKS) {
      const { postId, task } = this.queue.shift();
      if (task) {
        const taskPromise = (async () => {
          try {
            await task();
          } catch (error) {
            console.error("Error processing request for postId:", postId, error);
            this.queue.unshift({ postId, task }); // Re-queue the task on failure
            await this.exponentialBackoff(this.queue.length);
          } finally {
            this._isProcessing.delete(postId);
          }
        })();
        processingTasks.push(taskPromise);

        taskPromise.then(() => {
          const index = processingTasks.indexOf(taskPromise);
          if (index > -1) {
            processingTasks.splice(index, 1);
          }
          if (this.queue.length > 0) {
            this.processQueue();
          }
        });
      }
    }

    await Promise.all(processingTasks);
    this.processing = false;
  }

  private async exponentialBackoff(retryCount: number): Promise<void> {
    const delay = Math.pow(2, retryCount) * 1000;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

export default TaskQueue;