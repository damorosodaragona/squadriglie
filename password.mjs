import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
const options={N:16384,r:8,p:5,maxmem:32*1024*1024};
export function hashPassword(password){const salt=randomBytes(16).toString('hex');return `scrypt-v1$${salt}$${scryptSync(password,salt,32,options).toString('hex')}`}
export function verifyPassword(password,stored){const [version,salt,hash]=stored.split('$');if(version!=='scrypt-v1'||!/^[a-f0-9]{32}$/.test(salt)||!/^[a-f0-9]{64}$/.test(hash))return false;return timingSafeEqual(scryptSync(password,salt,32,options),Buffer.from(hash,'hex'))}
export function token(){return randomBytes(32).toString('hex')}
export function digest(value){return createHash('sha256').update(value).digest('hex')}
