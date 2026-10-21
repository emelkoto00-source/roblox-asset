import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { required } from './config';
import { Readable } from 'node:stream';
let client:S3Client|undefined;
function s3(){
  if(!client) client=new S3Client({
    endpoint:required('S3_ENDPOINT'),region:process.env.S3_REGION||'auto',
    forcePathStyle:process.env.S3_FORCE_PATH_STYLE!=='false',
    credentials:{accessKeyId:required('S3_ACCESS_KEY_ID'),secretAccessKey:required('S3_SECRET_ACCESS_KEY')}
  });
  return client;
}
export async function savePNG(key:string,data:Buffer){
  await s3().send(new PutObjectCommand({Bucket:required('S3_BUCKET'),Key:key,Body:data,ContentType:'image/png'}));
}
export async function loadPNG(key:string):Promise<Buffer>{
  const result=await s3().send(new GetObjectCommand({Bucket:required('S3_BUCKET'),Key:key}));
  if (!result.Body) throw new Error('Object missing');
  return Buffer.from(await result.Body.transformToByteArray());
}
