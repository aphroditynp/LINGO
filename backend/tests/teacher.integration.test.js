const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");
const { attachTeacherRoutes } = require("../teacher-routes");
const SECRET="test-only-integration-secret-not-for-production";
const collections = {
  teachers:new Map(),
  users:new Map([["studentA",{name:"Test A",age:6}],["studentB",{name:"Test B",age:5}]]),
  sessions:new Map([["session1",{user_id:"studentA",accuracy:100}],["session2",{user_id:"studentB",accuracy:50}]])
};
const db = {collection(name) {
  const data = collections[name];
  assert.ok(data,`unexpected collection ${name}`);
  const docRef = (id)=>({
    id,
    async get(){return {id,exists:data.has(id),data:()=>data.get(id)}} ,
    async create(value){ if(data.has(id)){ const e=new Error('already exists');e.code=6;throw e;} data.set(id,value);},
    async update(value){if(!data.has(id))throw new Error('missing'); data.set(id,{...data.get(id),...value});}
  });
  return {doc:docRef, async get(){return {docs:[...data.entries()].map(([id,body])=>({id,exists:true,data:()=>body}))}},
    where(field,operator,matched){assert.equal(operator,'==');return {async get(){return {docs:[...data.entries()].filter(([id,row])=>row[field]===matched).map(([id,row])=>({id,data:()=>row}))}}};}
  };
}};
async function run(){
  const app=express();app.use(express.json());
  function requireAdmin(req,res,next){try{const decoded=jwt.verify((req.get('Authorization')||'').replace('Bearer ',''),SECRET);if(decoded.role!=='admin')return res.status(403).json({error:'admin only'});next();}catch{return res.status(401).json({error:'login admin'});}}
  attachTeacherRoutes({app,db,requireAdmin,JWT_SECRET:SECRET});
  const srv=app.listen(0,'127.0.0.1');await new Promise(resolve=>srv.once('listening',resolve));
  const port=srv.address().port;const adminToken=jwt.sign({role:'admin'},SECRET);let teacherToken='';
  async function hit(method,path,body,token){let r=await fetch(`http://127.0.0.1:${port}/api${path}`,{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});let json=await r.json();return {status:r.status,data:json};}
  try{
    let a=await hit('POST','/admin/teachers',{username:'guru_satu',name:'Guru Satu',password:'correct-password-123'},adminToken);assert.equal(a.status,201);
    assert.ok(!JSON.stringify(a.data).includes('password_hash'));
    a=await hit('POST','/admin/teachers',{username:'guru_satu',name:'Guru Satu',password:'correct-password-123'},adminToken);assert.equal(a.status,409);
    a=await hit('POST','/teacher/login',{username:'guru_satu',password:'wrong'});assert.equal(a.status,401);
    a=await hit('POST','/teacher/login',{username:'guru_satu',password:'correct-password-123'});assert.equal(a.status,200);teacherToken=a.data.token;
    a=await hit('GET','/teacher/students',undefined,teacherToken);assert.equal(a.status,200);assert.deepEqual(a.data,[]);
    a=await hit('GET','/teacher/students/studentA',undefined,teacherToken);assert.equal(a.status,403);
    a=await hit('PUT','/admin/teachers/guru_satu/students',{user_ids:['studentA','doesnotexist']},adminToken);assert.equal(a.status,400);
    a=await hit('PUT','/admin/teachers/guru_satu/students',{user_ids:['studentA']},adminToken);assert.equal(a.status,200);
    a=await hit('GET','/teacher/students',undefined,teacherToken);assert.equal(a.status,200);assert.equal(a.data.length,1);assert.equal(a.data[0].id,'studentA');
    a=await hit('GET','/teacher/students/studentA/sessions',undefined,teacherToken);assert.equal(a.status,200);assert.equal(a.data.length,1);assert.equal(a.data[0].accuracy,100);
    a=await hit('GET','/teacher/students/studentB/sessions',undefined,teacherToken);assert.equal(a.status,403);
    a=await hit('GET','/admin/teachers',undefined,teacherToken);assert.equal(a.status,403);
    a=await hit('PUT','/admin/teachers/guru_satu/students',{user_ids:[]},adminToken);assert.equal(a.status,200);
    a=await hit('GET','/teacher/students/studentA/sessions',undefined,teacherToken);assert.equal(a.status,403);
    a=await hit('PATCH','/admin/teachers/guru_satu/status',{active:false},adminToken);assert.equal(a.status,200);
    a=await hit('GET','/teacher/me',undefined,teacherToken);assert.equal(a.status,403);
    console.log('PASS teacher scoped login, create, assignment, revocation, roles, sessions and disabling');
  } finally {await new Promise(r=>srv.close(r));}
}
run().catch(e=>{console.error(e);process.exitCode=1});
