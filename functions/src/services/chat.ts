import { Timestamp, type Transaction } from 'firebase-admin/firestore';
import { z } from 'zod';
import { db,type Actor,type Data,parse,identifier,commandId,version,empty,fail,command,assertActive,requireDoc,checkVersion,hash,dayKey,id,cursorDecode,cursorEncode } from '../shared/core.js';
import { readDeckSource, readWordVersion } from './dictionary.js';
import { type ChatApi,type ChatPrompt,type ReferenceWord,contextSchema,mentionedWords,validateContextOrder } from '../domain/chat.js';

const chatPath=(actor:Actor,sessionId:string)=>`users/${actor.uid}/aiSessions/${sessionId}`;
const sessionSchema=z.object({sessionId:identifier});
const turnSchema=sessionSchema.extend({turnId:identifier,expectedVersion:version,message:z.string().trim().min(1).max(2000),context:contextSchema}).strict();
const replyCache=new Map<string,{reply:string;expiresAt:number}>();
function cacheKey(actor:Actor,sessionId:string,turnId:string):string{return `${actor.uid}/${sessionId}/${turnId}`;}
function pruneCache():void{for(const[key,value]of replyCache)if(value.expiresAt<Date.now())replyCache.delete(key);if(replyCache.size>500)replyCache.delete(replyCache.keys().next().value!);}
async function promptFor(chat:Data,context:z.infer<typeof contextSchema>,message?:string):Promise<ChatPrompt>{
  const words:ReferenceWord[]=[];
  for(const ref of chat.referenceWords){const word=await readWordVersion(ref.wordId,ref.wordVersion);words.push({...ref,spelling:word.spelling,otherSpellings:word.otherSpellings??[]});}
  return {scenario:chat.scenarioSnapshot,words,context,message};
}
async function deliveredContext(actor:Actor,sessionId:string,context:z.infer<typeof contextSchema>):Promise<void>{
  const delivered=await db.collection(`${chatPath(actor,sessionId)}/processedTurns`).where('status','==','DELIVERED').orderBy('turnOrder').get();
  if(!validateContextOrder(context,delivered.docs.map(doc=>doc.id)))fail('CONTEXT_INVALID');
  for(let index=0;index<delivered.docs.length;index++)if(delivered.docs[index].data().learnerHash!==hash(context.pairs[index].learner)||delivered.docs[index].data().replyHash!==hash(context.pairs[index].assistant))fail('CONTEXT_INVALID');
}
async function candidates(actor:Actor,wordSetId:string,tx?:Transaction):Promise<Data>{
  const source=await readDeckSource({sourceType:'SYSTEM_DECK',wordSetId},tx);
  const remembered:ReferenceWord[]=[],other:ReferenceWord[]=[];
  for(const item of source.words){
    const memoryRef=db.doc(`users/${actor.uid}/wordProgress/${item.wordId}`);
    const memory=(await (tx?tx.get(memoryRef):memoryRef.get())).data();
    const word={wordId:item.wordId,wordVersion:item.wordVersion,wordOrder:0,spelling:item.word.spelling,otherSpellings:item.word.otherSpellings??[]};
    (memory?.lastChoice==='REMEMBERED'?remembered:other).push(word);
  }
  return {revisionId:source.source.revisionId,refs:[...remembered,...other].map((word,index)=>({...word,wordOrder:index})),rememberedCount:remembered.length,needsSupplement:remembered.length<5};
}
export function createChatHandlers(api:ChatApi):Record<string,(actor:Actor,input:unknown)=>Promise<unknown>>{
  async function startChat(actor:Actor,raw:unknown):Promise<Data>{
    const req=parse(z.object({wordSetId:identifier,scenarioId:identifier,allowSupplement:z.boolean(),commandId}).strict(),raw);
    const existing=(await db.doc(`users/${actor.uid}/commands/${req.commandId}`).get()).data();
    if(existing){await assertActive(actor);if(existing.kind!=='startChat'||existing.requestHash!==hash({kind:'startChat',input:req}))fail('COMMAND_REUSED');return existing.receipt;}
    await assertActive(actor);
    const sessionId=id();
    return command(actor,'startChat',req,async(tx,now)=>{
      const options=await candidates(actor,req.wordSetId,tx);
      if(options.needsSupplement&&!req.allowSupplement)fail('SUPPLEMENT_CONFIRMATION_REQUIRED');
      const refs:ReferenceWord[]=options.needsSupplement?options.refs.slice(0,Math.max(5,options.rememberedCount)):options.refs.slice(0,options.rememberedCount);
      if(!refs.length)fail('INSUFFICIENT_CHAT_SOURCE');
      const usageRef=db.doc(`users/${actor.uid}/aiDailyUsage/${dayKey(now.toDate())}`);
      const [usageDoc,limitDoc,topicDoc,deckDoc]=await tx.getAll(usageRef,db.doc('config/ai'),db.doc(`aiScenarios/${req.scenarioId}`),db.doc(`systemDecks/${req.wordSetId}`));
      const topic=requireDoc(topicDoc,'TOPIC_NOT_FOUND'),deck=requireDoc(deckDoc,'DECK_NOT_FOUND'),limit=requireDoc(limitDoc,'AI_NOT_CONFIGURED');
      if(!topic.active||!deck.active)fail('DECK_UNAVAILABLE');
      if(deck.publishedRevisionId!==options.revisionId)fail('CONFLICT');
      const memories=await tx.getAll(...refs.map(word=>db.doc(`users/${actor.uid}/wordProgress/${word.wordId}`)));
      if(!req.allowSupplement&&memories.filter(memory=>memory.data()?.lastChoice==='REMEMBERED').length<5)fail('SUPPLEMENT_CONFIRMATION_REQUIRED');
      const used=usageDoc.data()?.successfulSessionCount??0;if(used>=limit.maxSessionsPerDay)fail('AI_DAILY_LIMIT');
      const chat={id:sessionId,wordSetId:req.wordSetId,wordSetRevisionId:options.revisionId,scenarioId:req.scenarioId,scenarioSnapshot:topic,referenceWordIds:refs.map(word=>word.wordId),referenceWords:refs.map(({wordId,wordVersion,wordOrder})=>({wordId,wordVersion,wordOrder})),status:'ACTIVE',completedTurns:0,version:1,createdAt:now};
      tx.create(db.doc(chatPath(actor,sessionId)),chat);tx.set(usageRef,{dayKey:dayKey(now.toDate()),successfulSessionCount:used+1});return chat;
    });
  }
  async function sendMessage(actor:Actor,raw:unknown):Promise<Data>{
    const req=parse(turnSchema,raw);await assertActive(actor);pruneCache();
    const ref=db.doc(chatPath(actor,req.sessionId)),turnRef=ref.collection('processedTurns').doc(req.turnId);
    const requestHash=hash(req),leaseId=id();
    const begun=await db.runTransaction(async tx=>{
      await assertActive(actor,tx);const [chatDoc,turnDoc]=await tx.getAll(ref,turnRef);const chat=requireDoc(chatDoc),turn=turnDoc.data();
      if(turn){
        if(turn.requestHash!==requestHash)fail('COMMAND_REUSED');
        if(turn.status==='REPLY_READY'){const cached=replyCache.get(cacheKey(actor,req.sessionId,req.turnId));return {cached:cached?{turnId:req.turnId,chatVersion:turn.readyVersion,reply:cached.reply,status:'REPLY_READY'}:{turnId:req.turnId,chatVersion:chat.version,status:'INTERRUPTED'}};}
        if(['DELIVERED','DISCARDED'].includes(turn.status))return {cached:{turnId:req.turnId,chatVersion:chat.version,status:'INTERRUPTED'}};
        if(turn.status==='PENDING'&&turn.leaseExpiresAt.toMillis()>Date.now())fail('TURN_IN_PROGRESS');
      }
      checkVersion(chat.version,req.expectedVersion);if(chat.status!=='ACTIVE'||chat.completedTurns>=15)fail('CHAT_ENDED');
      if(chat.pendingTurnId&&chat.pendingTurnId!==req.turnId)fail('TURN_IN_PROGRESS');
      tx.set(turnRef,{turnId:req.turnId,status:'PENDING',requestHash,leaseId,leaseExpiresAt:Timestamp.fromMillis(Date.now()+60_000),turnOrder:chat.completedTurns+1,learnerHash:hash(req.message)});
      tx.update(ref,{pendingTurnId:req.turnId});return {chat};
    });
    if(begun.cached)return begun.cached;
    let reply:string;
    try{await deliveredContext(actor,req.sessionId,req.context);reply=(await api.reply(await promptFor(begun.chat!,req.context,req.message))).reply;}
    catch{
      await db.runTransaction(async tx=>{const current=(await tx.get(turnRef)).data();if(current?.leaseId===leaseId&&current.status==='PENDING')tx.update(turnRef,{status:'FAILED',errorCode:'AI_REPLY_UNAVAILABLE',leaseExpiresAt:Timestamp.fromMillis(0)});});
      return {turnId:req.turnId,chatVersion:req.expectedVersion,status:'FAILED'};
    }
    const receipt=await db.runTransaction(async tx=>{
      await assertActive(actor,tx);const [chatDoc,turnDoc]=await tx.getAll(ref,turnRef);const chat=requireDoc(chatDoc),turn=requireDoc(turnDoc);
      if(turn.leaseId!==leaseId||turn.status!=='PENDING')fail('TURN_INTERRUPTED');
      if(chat.status!=='ACTIVE'||chat.version!==req.expectedVersion){tx.update(turnRef,{status:'DISCARDED'});return {turnId:req.turnId,chatVersion:chat.version,status:'INTERRUPTED'};}
      const readyVersion=chat.version+1;tx.update(turnRef,{status:'REPLY_READY',readyVersion,replyHash:hash(reply),leaseExpiresAt:Timestamp.fromMillis(0)});tx.update(ref,{version:readyVersion});return {turnId:req.turnId,chatVersion:readyVersion,status:'REPLY_READY',reply};
    });
    if(receipt.status==='REPLY_READY')replyCache.set(cacheKey(actor,req.sessionId,req.turnId),{reply,expiresAt:Date.now()+10*60_000});return receipt;
  }
  async function acknowledgeTurn(actor:Actor,raw:unknown):Promise<Data>{
    const req=parse(sessionSchema.extend({turnId:identifier,expectedVersion:version}).strict(),raw);
    return db.runTransaction(async tx=>{
      await assertActive(actor,tx);const ref=db.doc(chatPath(actor,req.sessionId)),turnRef=ref.collection('processedTurns').doc(req.turnId);
      const [chatDoc,turnDoc]=await tx.getAll(ref,turnRef);const chat=requireDoc(chatDoc),turn=requireDoc(turnDoc);
      if(turn.status==='DELIVERED')return turn.ackReceipt;
      checkVersion(chat.version,req.expectedVersion);if(chat.status!=='ACTIVE'||turn.status!=='REPLY_READY'||turn.readyVersion!==req.expectedVersion||chat.pendingTurnId!==req.turnId)fail('TURN_INTERRUPTED');
      const receipt={turnId:req.turnId,completedTurns:chat.completedTurns+1,chatVersion:chat.version+1};
      tx.update(turnRef,{status:'DELIVERED',acknowledgedAt:Timestamp.now(),ackReceipt:receipt});tx.update(ref,{completedTurns:receipt.completedTurns,version:receipt.chatVersion,pendingTurnId:null,...(receipt.completedTurns===15?{status:'ENDING'}:{})});
      replyCache.delete(cacheKey(actor,req.sessionId,req.turnId));return receipt;
    });
  }
  async function endChat(actor:Actor,raw:unknown):Promise<Data>{
    const req=parse(sessionSchema.extend({expectedVersion:version,commandId,context:contextSchema.optional()}).strict(),raw);
    await assertActive(actor);const ref=db.doc(chatPath(actor,req.sessionId)),summaryRef=db.doc(`users/${actor.uid}/aiSummaries/${req.sessionId}`),commandRef=db.doc(`users/${actor.uid}/commands/${req.commandId}`);
    if(req.context)await deliveredContext(actor,req.sessionId,req.context);
    const requestHash=hash({kind:'endChat',input:{sessionId:req.sessionId,expectedVersion:req.expectedVersion,commandId:req.commandId,contextHash:req.context?hash(req.context):null}});
    const begun=await db.runTransaction(async tx=>{
      await assertActive(actor,tx);const [chatDoc,summaryDoc,commandDoc]=await tx.getAll(ref,summaryRef,commandRef);const chat=requireDoc(chatDoc),previous=commandDoc.data();
      if(previous&&previous.requestHash!==requestHash)fail('COMMAND_REUSED');if(summaryDoc.exists)return {summary:summaryDoc.data()!};
      if(previous?.status!=='IN_PROGRESS'){checkVersion(chat.version,req.expectedVersion);if(!['ACTIVE','ENDING','INTERRUPTED'].includes(chat.status))fail('CHAT_ENDED');}
      if(chat.endingCommandId&&chat.endingCommandId!==req.commandId)fail('CONFLICT');
      tx.update(ref,{status:'ENDING',endingCommandId:req.commandId});tx.set(commandRef,{kind:'endChat',requestHash,status:'IN_PROGRESS',createdAt:Timestamp.now()});return {chat};
    });
    if(begun.summary)return begun.summary;
    const chat=begun.chat!;let strengths:string[]=[],tips:string[]=[],mentionedWordIds:string[]=[],feedbackStatus='NOT_REQUESTED';
    if(chat.completedTurns>0){
      feedbackStatus='UNAVAILABLE';
      if(req.context){
        await deliveredContext(actor,req.sessionId,req.context);
        mentionedWordIds=mentionedWords((await promptFor(chat,req.context)).words,req.context);
        try{const feedback=await api.giveFeedback(await promptFor(chat,req.context));
          const originals=req.context.pairs.map(pair=>pair.learner.toLocaleLowerCase('en'));
          if([...feedback.strengths,...feedback.tips].some(item=>originals.some(original=>item.toLocaleLowerCase('en').includes(original))))throw new Error('QUOTED_CONTENT');
          strengths=feedback.strengths;tips=feedback.tips;feedbackStatus='AVAILABLE';
        }catch{feedbackStatus='UNAVAILABLE';}
      }
    }
    return db.runTransaction(async tx=>{
      await assertActive(actor,tx);const [chatDoc,existing]=await tx.getAll(ref,summaryRef);if(existing.exists)return existing.data()!;const current=requireDoc(chatDoc);if(current.endingCommandId!==req.commandId)fail('CONFLICT');
      const summary={sessionId:req.sessionId,wordSetId:chat.wordSetId,scenarioId:chat.scenarioId,completedTurns:chat.completedTurns,mentionedWordIds,strengths,tips,feedbackStatus,endedAt:Timestamp.now()};
      tx.create(summaryRef,summary);tx.update(ref,{status:req.context||!chat.completedTurns?'FINISHED':'INTERRUPTED',version:current.version+1,pendingTurnId:null});tx.update(commandRef,{status:'SUCCEEDED',receipt:summary});
      for(const key of replyCache.keys())if(key.startsWith(`${actor.uid}/${req.sessionId}/`))replyCache.delete(key);return summary;
    });
  }
  return {startChat,sendMessage,acknowledgeTurn,endChat,
    async getChatWords(actor,raw){const input=parse(z.object({wordSetId:identifier}).strict(),raw);await assertActive(actor);return candidates(actor,input.wordSetId);},
    async getTopics(actor,raw){parse(empty,raw);await assertActive(actor);return {items:(await db.collection('aiScenarios').where('active','==',true).get()).docs.map(doc=>({...doc.data(),id:doc.id}))};},
    async getChatHistory(actor,raw){const input=parse(z.object({cursor:z.string().max(4096).optional()}).strict(),raw);await assertActive(actor);let query=db.collection(`users/${actor.uid}/aiSummaries`).orderBy('endedAt','desc').orderBy('__name__','desc').limit(21);if(input.cursor){const cursor=cursorDecode(input.cursor);if(cursor.uid!==actor.uid)fail('VALIDATION_FAILED');query=query.startAfter(Timestamp.fromMillis(cursor.time),cursor.id);}const docs=await query.get(),items=docs.docs.slice(0,20).map(doc=>({...doc.data(),id:doc.id})),last=docs.docs[19];return {items,cursor:docs.size>20?cursorEncode({uid:actor.uid,time:last.data().endedAt.toMillis(),id:last.id}):undefined};},
    async getChatSummary(actor,raw){const input=parse(sessionSchema.strict(),raw);await assertActive(actor);return requireDoc(await db.doc(`users/${actor.uid}/aiSummaries/${input.sessionId}`).get());},
  };
}
