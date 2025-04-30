import type { Server as SocketIOServer } from "socket.io";
import type { Redis } from "ioredis";

export interface UserPresence {
  handle: string;
  image?: string | null;
  score: number;
}

interface PostPresence {
  postId: string;
  users: UserPresence[];
}

class PostPresenceController {
  private io: SocketIOServer;
  private redis: Redis;
  private readonly POST_PRESENCE_KEY = 'post:presence:';

  constructor(io: SocketIOServer, redis: Redis) {
    this.io = io;
    this.redis = redis;
    this.setupPostPresence();
  }

  async getPostPresence(postId: string): Promise<PostPresence> {
    const key = this.getRedisKey(postId);
    const data = await this.redis.get(key);

    if (!data) {
      return { postId, users: [] };
    }

    try {
      return JSON.parse(data);
    } catch {
      return { postId, users: [] };
    }
  }

  private setupPostPresence() {
    this.io.on('connection', async (socket) => {
      const { roomId, handle, image, score, isPost } = socket.handshake.query;

      // Only handle post presence connections
      if (isPost && roomId && handle && typeof roomId === 'string' && typeof handle === 'string') {
        try {
          // Join the room
          await socket.join(roomId);

          // Get current users in room from Redis
          const currentPresence = await this.getPostPresence(roomId);
          const userPresence: UserPresence = {
            handle,
            image: image ? image as string : "",
            score: score ? Number.parseInt(score as string) : 0
          };

          // Add new user if not already present
          if (!currentPresence.users.some(u => u.handle === handle)) {
            currentPresence.users.push(userPresence);
            await this.setPostPresence(roomId, currentPresence.users);
          }

          // Emit updated list to all clients in room
          this.io.to(roomId).emit('connectedAccounts', currentPresence.users);

          // Handle disconnection
          socket.on('disconnect', async () => {
            const presence = await this.getPostPresence(roomId);
            const updatedUsers = presence.users.filter(u => u.handle !== handle);

            if (updatedUsers.length === 0) {
              // If no users left, remove the key from Redis
              await this.redis.del(this.getRedisKey(roomId));
            } else {
              // Otherwise update with remaining users
              await this.setPostPresence(roomId, updatedUsers);
            }

            // Emit updated list to remaining clients
            this.io.to(roomId).emit('connectedAccounts', updatedUsers);
          });
        } catch (error) {
          console.error('Error handling post presence:', error);
        }
      }
    });
  }

  private getRedisKey(postId: string): string {
    return `${this.POST_PRESENCE_KEY}${postId}`;
  }

  private async setPostPresence(postId: string, users: UserPresence[]): Promise<void> {
    const key = this.getRedisKey(postId);
    const data: PostPresence = {
      postId,
      users
    };

    // Store with 1 hour expiry
    await this.redis.set(key, JSON.stringify(data), 'EX', 3600);
  }
}

export default PostPresenceController;