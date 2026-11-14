// Request-scoped timings and fixed error codes; never log payloads, headers, IPs or exceptions.
export function tracedEnvironment(env,trace){
  const db={prepare(query){const statement=env.DB.prepare(query);let bound=statement;
    const wrapped={bind(...args){bound=statement.bind(...args);return wrapped;}};
    for(const method of ["first","all","run"])wrapped[method]=async(...args)=>{
      const start=Date.now();try{return await bound[method](...args);}catch{throw Error("d1_unavailable");}finally{trace.d1Ms+=Date.now()-start;}
    };return wrapped;
  }};
  const bucket={};
  for(const method of ["put","get","delete","list"])bucket[method]=async(...args)=>{
    const start=Date.now();try{return await env.LOGS_BUCKET[method](...args);}catch{throw Error("r2_unavailable");}finally{trace.r2Ms+=Date.now()-start;}
  };
  return {...env,DB:db,LOGS_BUCKET:bucket};
}
