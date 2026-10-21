import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { required } from './config';
let conn:IORedis|undefined;
let queue:Queue|undefined;
export function redisConnection(){
  if (!conn) conn=new IORedis(required('REDIS_URL'),{maxRetriesPerRequest:null});
  return conn;
}
export function uploadQueue(){
  if (!queue) queue=new Queue('est-asset-publisher',{connection:redisConnection(),defaultJobOptions:{removeOnComplete:{age:86400,count:3000},removeOnFail:{age:604800,count:3000}}});
  return queue;
}
export async function enqueueUpload(id:string){
  await uploadQueue().add('upload',{assetId:id},{jobId:`upload-${id}`,attempts:1});
}
export async function enqueuePoll(id:string,delay=12000){
  await uploadQueue().add('poll',{assetId:id},{delay,jobId:`poll-${id}-${Date.now()}`,attempts:1});
}
