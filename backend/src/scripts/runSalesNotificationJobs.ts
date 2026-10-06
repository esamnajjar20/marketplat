import { spawn } from 'node:child_process';
const TZ='Asia/Gaza';
function now(){const parts=new Intl.DateTimeFormat('en-US',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hour12:false,weekday:'short'}).formatToParts(new Date());const v=Object.fromEntries(parts.map(p=>[p.type,p.value]));return {hour:Number(v.hour)%24,minute:Number(v.minute),weekday:({Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6} as Record<string,number>)[v.weekday] ?? 0};}
function run(name:string){return new Promise<void>((resolve,reject)=>{const c=spawn('npm',['run',name],{stdio:'inherit',env:process.env});c.on('error',reject);c.on('exit',code=>code===0?resolve():reject(new Error(`${name} failed: ${code}`)));});}
async function main(){const n=now();const jobs:string[]=[];if(n.hour===8)jobs.push('report:overdue-sales-installments');if(n.hour===20)jobs.push('report:daily-sales-reminder');if(n.hour===9&&n.weekday===0)jobs.push('report:sales-debt-reminder','report:weekly-sales-report');for(const job of jobs)await run(job);console.log(`[sales-notifications] ${n.hour}:${String(n.minute).padStart(2,'0')} -> ${jobs.join(', ')||'nothing due'}`)}
main().catch(e=>{console.error(e);process.exitCode=1});
