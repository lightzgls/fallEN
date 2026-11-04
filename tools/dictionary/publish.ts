import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { db,bucket,hash,identifier,fail,checkVersion,requireDoc } from '../../functions/src/shared/core.js';
import { normalizeKey } from '../../functions/src/services/dictionary.js';

const meaning=z.object({id:identifier,partOfSpeech:z.string().min(1).max(100),text:z.string().min(1).max(1000),example:z.string().min(1).max(1000).optional(),exampleTranslation:z.string().min(1).max(1000).optional(),imageAssetId:identifier.optional(),imageAlt:z.string().min(1).max(300).optional()}).strict().refine(value=>Boolean(value.example)===Boolean(value.exampleTranslation)&&(!value.imageAssetId||Boolean(value.imageAlt)));
const dictionaryRef=z.object({sourceId:identifier,sourceEntryId:z.string().min(1).max(300),sourceVersion:z.string().min(1).max(100)}).strict();
export const manifestSchema=z.object({
  releaseId:identifier,sources:z.array(z.object({sourceId:identifier,name:z.string().min(1),version:z.string().min(1),license:z.string().min(1),redistributionAllowed:z.literal(true)}).strict()).min(1),
  words:z.array(z.object({wordId:identifier,version:z.number().int().positive(),spelling:z.string().min(1).max(200),phonetic:z.string().max(200).optional(),otherSpellings:z.array(z.string().min(1).max(200)),meanings:z.array(meaning).min(1),dictionaryRefs:z.array(dictionaryRef).min(1),active:z.boolean(),listenAllowed:z.boolean().default(false)}).strict()).min(1),
  connections:z.array(z.object({sourceWordId:identifier,sourceWordVersion:z.number().int().positive(),sourceMeaningId:identifier,targetWordId:identifier,targetWordVersion:z.number().int().positive(),targetMeaningId:identifier,type:z.enum(['SYNONYM','ANTONYM','COLLOCATION','WORD_FAMILY']),dictionaryRefs:z.array(dictionaryRef).min(1)}).strict()),
}).strict();
export type DictionaryManifest=z.infer<typeof manifestSchema>;

/** Operator-only Admin SDK pipeline. Content Admin never receives a Callable for it. */
export async function publishDictionaryManifest(raw:unknown,expectedConfigVersion:number,publishCommandId:string):Promise<{releaseId:string;version:number}>{
  const manifest=manifestSchema.parse(raw);identifier.parse(publishCommandId);
  const words=new Map(manifest.words.map(word=>[word.wordId,word]));
  if(words.size!==manifest.words.length)fail('VALIDATION_FAILED','Duplicate canonical wordId');
  const sources=new Set(manifest.sources.map(source=>source.sourceId));
  const keys=new Map<string,{wordId:string;wordVersion:number}>();
  for(const word of manifest.words){
    if(new Set(word.meanings.map(item=>item.id)).size!==word.meanings.length)fail('VALIDATION_FAILED','Duplicate meaningId');
    for(const ref of word.dictionaryRefs)if(!sources.has(ref.sourceId))fail('VALIDATION_FAILED','Unregistered lexical source');
    for(const spelling of [word.spelling,...word.otherSpellings]){const key=normalizeKey(spelling),old=keys.get(key);if(old&&old.wordId!==word.wordId)fail('VALIDATION_FAILED','Alias collision');keys.set(key,{wordId:word.wordId,wordVersion:word.version});}
    for(const item of word.meanings)if(item.imageAssetId){const asset=requireDoc(await db.doc(`imageAssets/${item.imageAssetId}`).get());if(asset.state!=='VALIDATED'||!asset.dictionaryRefs?.length)fail('VALIDATION_FAILED','Dictionary media needs validated rights metadata');}
  }
  const connections=new Map<string,DictionaryManifest['connections'][number]>();
  for(const connection of manifest.connections){
    const source=words.get(connection.sourceWordId),target=words.get(connection.targetWordId);
    if(!source||!target||source.wordId===target.wordId||source.version!==connection.sourceWordVersion||target.version!==connection.targetWordVersion||!source.meanings.some(item=>item.id===connection.sourceMeaningId)||!target.meanings.some(item=>item.id===connection.targetMeaningId)||connection.dictionaryRefs.some(ref=>!sources.has(ref.sourceId)))fail('VALIDATION_FAILED','Connection endpoints or source invalid');
    const key=hash(connection);if(connections.has(key))fail('VALIDATION_FAILED','Duplicate connection');connections.set(key,connection);
  }
  const contentHash=hash(manifest),releaseRef=db.doc(`dictionaryReleases/${manifest.releaseId}`);
  const previous=(await releaseRef.get()).data();
  if(previous&&previous.contentHash!==contentHash)fail('COMMAND_REUSED');
  if(previous?.state==='PUBLISHED'||previous?.state==='RETIRED'){
    if(previous.publishCommandId!==publishCommandId)fail('COMMAND_REUSED');return {releaseId:manifest.releaseId,version:previous.publishedConfigVersion};
  }
  if(!previous)await releaseRef.create({id:manifest.releaseId,state:'STAGING',contentHash,sources:manifest.sources,createdAt:Timestamp.now()});
  if(!previous||previous.state==='STAGING'){
    for(const word of manifest.words){
      await db.runTransaction(async tx=>{
        const release=requireDoc(await tx.get(releaseRef));if(release.state!=='STAGING')fail('CONFLICT');
        const ref=db.doc(`words/${word.wordId}/versions/${word.version}`),old=await tx.get(ref),operational=db.doc(`words/${word.wordId}`),current=await tx.get(operational);
        const {active:_active,listenAllowed:_listen,...lexical}=word;
        const newContent={...lexical,searchKey:normalizeKey(word.spelling)};
        if(old.exists&&hash(old.data())!==hash(newContent))fail('IMMUTABLE_WORD_VERSION');
        const aliasRefs=[...new Set([word.spelling,...word.otherSpellings].map(normalizeKey))].map(key=>({key,ref:db.doc(`wordKeys/${hash(key)}`)}));
        const aliases=await tx.getAll(...aliasRefs.map(item=>item.ref));
        for(const alias of aliases)if(alias.exists&&alias.data()!.wordId!==word.wordId)fail('CANONICAL_ID_CONFLICT');
        if(!old.exists)tx.create(ref,newContent);
        if(!current.exists)tx.create(operational,{speech:{provider:'ANDROID_TTS',text:word.spelling,listenAllowed:word.listenAllowed,version:1}});
        tx.set(releaseRef.collection('entries').doc(word.wordId),{wordId:word.wordId,wordVersion:word.version,active:word.active,spelling:word.spelling,searchKey:normalizeKey(word.spelling)});
        for(const [index,alias]of aliasRefs.entries()){if(!aliases[index].exists)tx.create(alias.ref,{normalizedKey:alias.key,wordId:word.wordId});tx.set(releaseRef.collection('keys').doc(hash(alias.key)),{normalizedKey:alias.key,wordId:word.wordId,wordVersion:word.version});}
      });
    }
    for(const[key,connection]of connections)await db.runTransaction(async tx=>{const release=requireDoc(await tx.get(releaseRef));if(release.state!=='STAGING')fail('CONFLICT');tx.set(releaseRef.collection('connections').doc(key),{...connection,id:key,releaseId:manifest.releaseId,active:true});});
    const indexBytes=JSON.stringify({releaseId:manifest.releaseId,entries:[...keys].map(([key,value])=>({key,...value}))});
    const searchIndexPath=`dictionary/${manifest.releaseId}/search-index.json`,searchIndexHash=hash(indexBytes);
    await bucket.file(searchIndexPath).save(indexBytes,{contentType:'application/json',resumable:false});
    const [downloaded]=await bucket.file(searchIndexPath).download();if(hash(downloaded.toString())!==searchIndexHash)fail('INDEX_INVALID');
    await db.runTransaction(async tx=>{
      const release=requireDoc(await tx.get(releaseRef));const [entries,keyDocs,connectionDocs]=await Promise.all([tx.get(releaseRef.collection('entries')),tx.get(releaseRef.collection('keys')),tx.get(releaseRef.collection('connections'))]);
      if(release.state!=='STAGING'||release.contentHash!==contentHash||entries.size!==words.size||keyDocs.size!==keys.size||connectionDocs.size!==connections.size)fail('MANIFEST_MISMATCH');
      tx.update(releaseRef,{state:'READY',entryCount:entries.size,connectionCount:connectionDocs.size,searchIndexPath,searchIndexHash});
    });
  }
  return db.runTransaction(async tx=>{
    const configRef=db.doc('config/dictionary'),[releaseDoc,configDoc]=await tx.getAll(releaseRef,configRef),release=requireDoc(releaseDoc),config=configDoc.data();
    if(['PUBLISHED','RETIRED'].includes(release.state)&&release.publishCommandId===publishCommandId)return {releaseId:manifest.releaseId,version:release.publishedConfigVersion};
    checkVersion(config?.version??0,expectedConfigVersion);if(release.state!=='READY'||release.contentHash!==contentHash||!release.searchIndexHash)fail('MANIFEST_MISMATCH');
    const previousRef=config?.activeReleaseId?db.doc(`dictionaryReleases/${config.activeReleaseId}`):undefined;if(previousRef)await tx.get(previousRef);
    const next=expectedConfigVersion+1;tx.set(configRef,{activeReleaseId:manifest.releaseId,version:next});tx.update(releaseRef,{state:'PUBLISHED',publishedAt:Timestamp.now(),publishCommandId,publishedConfigVersion:next});if(previousRef&&previousRef.id!==manifest.releaseId)tx.update(previousRef,{state:'RETIRED'});return {releaseId:manifest.releaseId,version:next};
  });
}
