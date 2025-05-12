import { createClient } from 'redis';

const redisClient = createClient({
  url: process.env.REDIS_URL
});

let isConnected = false;

export async function connectRedis() {
  if (!isConnected) {
    await redisClient.connect();
    isConnected = true;
    console.log('✅ Connected to Redis successfully');
  }
}

export default redisClient; 