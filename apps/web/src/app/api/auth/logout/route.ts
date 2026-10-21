import { NextResponse } from 'next/server';
import { hasValidOrigin } from '@/lib/auth';
export async function POST(request:Request){
 if(!hasValidOrigin(request))return new Response('Origin rejected',{status:403});
 const res=NextResponse.redirect(new URL('/login',request.url),{status:303});
 res.cookies.set({name:'est_cloud_session',value:'',path:'/',maxAge:0});
 return res;
}
