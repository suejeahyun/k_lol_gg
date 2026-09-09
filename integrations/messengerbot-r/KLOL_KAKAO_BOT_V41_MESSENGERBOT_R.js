var e=function(){var e="KLOL_KAKAO_WEBHOOK_V1";
var r="KLOL_V2_BASE_URL";
var t="KLOL_V2_KAKAO_WEBHOOK_SECRET_CURRENT";
var n="KLOL_V2_KAKAO_IDENTITY_SECRET";
var i={recruit:"/api/integrations/kakao/recruits",playerSearch:"/api/integrations/kakao/search-player",openchat:"/api/integrations/kakao/openchat",seasonApplications:"/api/integrations/kakao/season-applications",managedForms:"/api/integrations/kakao/managed-forms",operationForms:"/api/integrations/kakao/operation-forms",imageReceive:"/api/integrations/kakao/image-receive",scheduledNotice:"/api/integrations/kakao/scheduled-notice"}
;
function a(e){return String(e==null?"":e).replace(/^\s+|\s+$/g,"");
}function u(e){try{return a(String(DataBase.getDataBase(e)||""));
}
catch(e){return"";
}}
function o(e){return new java.lang.String(String(e)).getBytes(java.nio.charset.StandardCharsets.UTF_8);
}function s(e){var r=new java.lang.StringBuilder(e.length*2);
for(var t=0;
t<e.length;
t+=1){var n=e[t]&255;
if(n<16)r.append("0");
r.append(java.lang.Integer.toHexString(n));
}
return String(r.toString());
}function l(e){var r=java.security.MessageDigest.getInstance("SHA-256");
return s(r.digest(o(e)));
}
function c(e){var r=android.util.Base64.decode(String(e),android.util.Base64.DEFAULT);
var t=java.security.MessageDigest.getInstance("SHA-256");
return s(t.digest(r));
}function m(e,r){var t=javax.crypto.Mac.getInstance("HmacSHA256");
t.init(new javax.crypto.spec.SecretKeySpec(o(e),"HmacSHA256"));
return s(t.doFinal(o(r)));
}
function f(e){var r=a(e).replace(/\/+$/,"");
if(!r)throw new Error("V2 HTTPS 주소가 없습니다. 봇의 KLOL_V2_BASE_URL 비공개 설정을 확인해 주세요.");
if(!/^https:\/\/[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?(?::443)?$/.test(r))throw new Error("V2 HTTPS 주소 설정을 확인해 주세요.");
return r;
}function p(){return f(u(r));
}
function d(e,r){var t=a(e);
if(!/^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/.test(t))throw new Error(r+" 식별자 설정을 확인해 주세요.");
return t;
}function v(){var e=u(t);
if(o(e).length<32)throw new Error("V2 서명 키가 없거나 너무 짧습니다. 봇의 비공개 설정을 확인해 주세요.");
return e;
}
function g(){var e=u(n);
if(o(e).length<32)throw new Error("V2 익명 식별 키가 없거나 너무 짧습니다. 봇의 비공개 설정을 확인해 주세요.");
return e;
}function N(){return String(java.util.UUID.randomUUID().toString()).replace(/-/g,"");
}
function h(){return String(java.util.UUID.randomUUID().toString());
}function S(e){return"mbr-v41-"+e;
}
function y(r,t,n,i,a){return[e,r,t,n,i,a].join("\n");
}function b(e){try{return JSON.parse(String(e||""));
}
catch(e){return null;
}}
function T(e,r,t){if(!t||typeof t!="object")throw new Error("V2 요청 컨텍스트가 필요합니다.");
if(!Object.prototype.hasOwnProperty.call(i,t.endpointName)||i[t.endpointName]!==e)throw new Error("허용되지 않은 V2 API 경로입니다.");
var n=JSON.stringify(r);
var u=d(t.roomId,"방");
var o=d(t.senderId,"발신자");
var s=N();
var c=Math.floor((new Date).getTime()/1e3);
var f=l(n);
var g="v1="+m(v(),y(c,s,u,o,f));
var h=org.jsoup.Jsoup.connect(p()+e).ignoreContentType(!0).ignoreHttpErrors(!0).method(org.jsoup.Connection.Method.POST).header("Content-Type","application/json; charset=utf-8").header("Accept","application/json").header("x-klol-timestamp",String(c)).header("x-klol-nonce",s).header("x-klol-room",u).header("x-klol-sender",o).header("x-klol-bot-self",t.botSelf===!0?"1":"0").header("x-klol-signature",g).header("Idempotency-Key",t.requestKey||S(s)).timeout(typeof t.timeoutMs=="number"?Math.floor(t.timeoutMs):12e3).requestBody(n);
if(e===i.imageReceive)h.maxBodySize(0);
if(typeof t.expectedRevision=="number"&&t.expectedRevision>=0)h.header("If-Match",'"'+String(Math.floor(t.expectedRevision))+'"');
var response=h.execute();
var T=b(response.body());
return{ok:response.statusCode()>=200&&response.statusCode()<300,status:response.statusCode(),body:T,traceId:a(response.header("X-Trace-Id"))};
}
function A(e,r){var t={};
var n="";
r=r||{}
;
for(n in r)if(Object.prototype.hasOwnProperty.call(r,n))t[n]=r[n];
t.endpointName=e;
return t;
}function L(e,r){var t=g();
return{roomId:"room-"+m(t,"room-id\n"+a(e)).substring(0,32),senderId:"sender-"+m(t,"sender-id\n"+a(r)).substring(0,32)}
;
}function O(e,r,t){var n=L(e,r);
var i={roomId:n.roomId,senderId:n.senderId,botSelf:!1}
;
var a="";
t=t||{};
for(a in t)if(Object.prototype.hasOwnProperty.call(t,a))i[a]=t[a];
return i;
}
function R(e,r){if(!r||typeof r.expectedRevision!="number")throw new Error("모집 요청에는 최신 revision이 필요합니다.");
return T(i.recruit,e,A("recruit",r));
}function I(e,r){return T(i.playerSearch,{query:String(e||"")}
,A("playerSearch",r));
}function E(e){return T(i.openchat,{command:"STATUS"}
,A("openchat",e));
}function C(e,r){return T(i.openchat,{command:"SEARCH_PLAYER",query:String(e||"")}
,A("openchat",r));
}function D(e,r){return T(i.openchat,{command:"RECORD",query:String(e||"")}
,A("openchat",r));
}function G(e,r){return T(i.openchat,{command:"RECENT",query:String(e||"")}
,A("openchat",r));
}function _(e){return T(i.openchat,{command:"RANKING"}
,A("openchat",e));
}function M(e,r){return T(i.seasonApplications,e,A("seasonApplications",r));
}
function x(e,r,t){return T(i.managedForms,{command:"SUBMIT_OPERATION_FORM",formType:e,payload:r},A("managedForms",t));
}
function P(e,r,t){return T(i.operationForms,{formType:e,payload:r},A("operationForms",t));
}
function U(e,r){return T(i.imageReceive,e,A("imageReceive",r));
}function K(e,r){return T(i.scheduledNotice,e==null?{}
:{slot:e},A("scheduledNotice",r));
}
function w(e){if(e&&e.ok)return"[K-LOL.GG]\n요청을 안전하게 처리했습니다.";
var r=e&&e.body&&typeof e.body=="object"?e.body:null;
var t=r&&typeof r.detail=="string"?r.detail:"잠시 후 다시 시도해 주세요.";
var n=e&&e.traceId?"\n문의 코드: "+e.traceId:"";
return"[K-LOL.GG 요청 실패]\n"+t+n;
}return{version:"KLOL_KAKAO_BOT_V41_V2_TRANSPORT_2026_09_09_REQUIRED_ORIGIN",contractVersion:e,publicBaseUrl:p,identityForChat:L,contextFromChat:O,sha256Base64BytesHex:c,newUuid:h,recruit:R,searchPlayer:I,openchatStatus:E,openchatSearch:C,playerRecord:D,recentMatches:G,ranking:_,seasonApplications:M,managedForm:x,operationForm:P,imageReceive:U,scheduledNotice:K,userMessage:w}
;
}();
var r=function(){var e=12e3;
var r=320;
var t=120;
var n=["TOP","JGL","MID","ADC","SUP"];
var i={TOP:"TOP","탑":"TOP",JUG:"JGL",JGL:"JGL",JG:"JGL",JUNGLE:"JGL","정글":"JGL",MID:"MID",MIDDLE:"MID","미드":"MID",ADC:"ADC",AD:"ADC",BOT:"ADC",BOTTOM:"ADC","원딜":"ADC","바텀":"ADC",SUP:"SUP",SPT:"SUP",SUPPORT:"SUP","서폿":"SUP","서포터":"SUP"}
;
function a(e){return String(e==null?"":e).replace(/^\s+|\s+$/g,"");
}function u(e){var r=String(e==null?"":e);
var t="";
var n=0;
var i=0;
for(n=0;
n<r.length;
n+=1){i=r.charCodeAt(n);
if(i>=65281&&i<=65374)t+=String.fromCharCode(i-65248);
else if(i===160||i===12288)t+=" ";
else t+=r.charAt(n);
}
return t.replace(/\r\n?/g,"\n").replace(/[–—]/g,"-").replace(/\n{4,}/g,"\n\n\n");
}function o(t){var n=String(t==null?"":t);
var i="";
if(n.length>e)return{ok:!1,error:"INPUT_TOO_LONG",text:""}
;
if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(n))return{ok:!1,error:"CONTROL_CHARACTER",text:""};
if(n.replace(/\r\n?/g,"\n").split("\n").length>r)return{ok:!1,error:"TOO_MANY_LINES",text:""}
;
i=u(n);
return{ok:!0,error:null,text:i};
}
function s(e,r){var t=o(e);
var n=t.ok?a(t.text).replace(/\s+/g," "):"";
return n&&n.length<=r?n:"";
}function l(e,r,t){return typeof e=="number"&&isFinite(e)&&Math.floor(e)===e&&e>=r&&e<=t;
}
function c(e,r){var t=e?Number(e):null;
return t!==null&&l(t,1,r)?t:null;
}function m(e){var r={"자랭구인":["FLEX_RANK","자랭 하실분!",5],"일반구인":["NORMAL_GAME","일반 하실분!",5],"솔랭구인":["SOLO_RANK","솔랭 하실분!",2],"칼바람구인":["ARAM","칼바람 하실분!",5],"증바람구인":["ARAM","증바람 하실분!",5],"기타게임구인":["OTHER_GAME","기타게임 하실분!",8],"롤체일반구인":["TFT_NORMAL","롤체 일반 하실분!",8],"롤체랭크구인":["TFT_RANK","롤체 랭크 하실분!",3],"더블업구인":["DOUBLE_UP","더블업 하실분!",2],"5인협곡":["PARTY_RIFT","5인 협곡 파티 구인",5],"5인협곡파티":["PARTY_RIFT","5인 협곡 파티 구인",5]}
;
return r[e]||null;
}function f(e){var r=o(e);
var t=r.ok?a(r.text):"";
var n=null;
var i=0;
var u=null;
var s=null;
var f="";
if(!t||t.indexOf("\n")>=0)return null;
n=t.match(/^\/?(\d{1,2})\s*인\s*(협곡\s*)?(?:파티|구인)(?:\s+(\d{1,2}))?\s*$/);
if(n){i=Number(n[1]);
u=c(n[3],99);
if(!l(i,1,99)||n[3]&&u===null)return null;
if(n[2]&&i!==5)return null;
return{domain:"PARTY",action:"CREATE",type:n[2]?"PARTY_RIFT":"PARTY_NUMBER",title:n[2]?"5인 협곡 파티 구인":String(i)+"인 파티 구인",maximumMembers:i,explicitRecruitNumber:u}
;
}n=t.match(/^\/?(자랭구인|일반구인|솔랭구인|칼바람구인|증바람구인|기타게임구인|롤체일반구인|롤체랭크구인|더블업구인|5\s*인\s*협곡(?:\s*파티)?)(?:\s+(\d{1,2}))?\s*$/);
if(!n)return null;
f=n[1].replace(/\s+/g,"");
s=m(f);
u=c(n[2],99);
if(!s||n[2]&&u===null)return null;
return{domain:"PARTY",action:"CREATE",type:s[0],title:s[1],maximumMembers:s[2],explicitRecruitNumber:u}
;
}function p(e){var r=o(e);
var t=r.ok?a(r.text):"";
var n=t.replace(/\s+/g,"");
var i=null;
if(!t||t.indexOf("\n")>=0)return null;
i=t.match(/^\/?#?\s*(\d{1,2})\s*(?:쫑|ㅉ)\s*$/);
if(!i)i=n.match(/^\/?#?(\d{1,2})(?:번|인)?(?:파티|구인)?(?:쫑|ㅉ|마감|종료)$/);
if(!i)i=t.match(/^\/?구인(?:마감|쫑|종료)\s*#?\s*(\d{1,2})\s*$/);
if(!i||!l(Number(i[1]),1,99))return null;
return{domain:"PARTY",action:"FINISH",recruitNo:Number(i[1])}
;
}function d(e){var r=e.match(/모집\s*번호\s*:?\s*#?\s*(\d{1,2})/i);
if(!r)r=e.match(/(^|\s)#\s*(\d{1,2})(?=\s|[·]|$)/);
var t=r?r[r.length-1]:null;
return c(t,99);
}
function v(e){var r=a(e).replace(/^[.:)\]\-\s]+/,"").replace(/\s+/g," ");
if(!r||r.length>100)return"";
if(/^(?:미정|없음|공란|-|모집중|\d+\s*명)$/.test(r))return"";
return r;
}function g(e){var r=a(e).toUpperCase();
return i[r]||i[a(e)]||null;
}
function N(e){var r=e.split("\n");
var t={startTimeText:null,tierText:null,preferredLineText:null,playStyle:null,note:null};
var n=0;
var i="";
var u="";
for(n=0;
n<r.length;
n+=1){i=a(r[n]).replace(/^[》>]\s*/,"");
if(/^(?:게임\s*)?(?:시작|출발)\s*시간\s*:/.test(i)){u=a(i.replace(/^(?:게임\s*)?(?:시작|출발)\s*시간\s*:/,""));
var o=u.match(/^(.*?)(?:\+\s*티어\s*[:：]?\s*)([^+]+)$/);
if(o){if(a(o[1]).length<=160)t.startTimeText=a(o[1])||null;
if(a(o[2]).length<=80)t.tierText=a(o[2])||null;
}
else if(u&&u.length<=160)t.startTimeText=u;
}else if(/^게임\s*정보\s*:/.test(i)){u=a(i.replace(/^게임\s*정보\s*:/,""));
if(u&&u.length<=500)t.note=u;
}
else if(/^(?:티어|현티어)\s*:/.test(i)){u=a(i.replace(/^(?:티어|현티어)\s*:/,""));
if(u&&u.length<=80)t.tierText=u;
}else if(/^(?:듀오\s*)?선호(?:하는)?\s*라인\s*:/.test(i)){u=a(i.replace(/^(?:듀오\s*)?선호(?:하는)?\s*라인\s*:/,""));
if(u&&u.length<=80)t.preferredLineText=u;
}
if(/즐겜/.test(i)&&!/빡겜/.test(i))t.playStyle="즐겜";
if(/빡겜/.test(i)&&!/즐겜/.test(i))t.playStyle="빡겜";
}return t;
}
function h(e,r,t){var n=[[/롤체\s*일반/,"TFT_NORMAL","롤체 일반 하실분!",8],[/롤체\s*랭크/,"TFT_RANK","롤체 랭크 하실분!",3],[/더블업/,"DOUBLE_UP","더블업 하실분!",2],[/솔랭/,"SOLO_RANK","솔랭 하실분!",2],[/자랭/,"FLEX_RANK","자랭 하실분!",5],[/일반/,"NORMAL_GAME","일반 하실분!",5],[/(?:칼바람|증바람)/,"ARAM",/증바람/.test(e)?"증바람 하실분!":"칼바람 하실분!",5],[/기타게임/,"OTHER_GAME","기타게임 하실분!",8],[/협곡/,"PARTY_RIFT","5인 협곡 파티 구인",5]];
var i=s(r,32);
var a=Number(t);
var u="파티 구인";
var o=0;
var c=null;
for(o=0;
o<n.length;
o+=1)if(n[o][0].test(e)){if(!i)i=n[o][1];
u=n[o][2];
if(!l(a,1,99))a=n[o][3];
break;
}c=e.match(/(\d{1,2})\s*인\s*(?:파티\s*)?구인/);
if(c&&!i){i="PARTY_NUMBER";
a=Number(c[1]);
u=String(a)+"인 파티 구인";
}
if(!i&&/(^|\n)\s*(?:TOP|JUG|JGL|JG|MID|ADC|AD|SUP|탑|정글|미드|원딜|서폿)\s*[.:]/i.test(e))i="PARTY_RIFT";
if(!l(a,1,99))a=i==="PARTY_RIFT"||i==="FLEX_RANK"||i==="NORMAL_GAME"?5:99;
return{type:i||"PARTY_NUMBER",title:u,maximumMembers:a};
}
function S(e,r,i){var u=o(e);
var s=u.ok?u.text:"";
var c=s?d(s):null;
var m=null;
var f=null;
var p=[];
var S=[];
var y={};
var b=0;
var T="";
var A=null;
var L=null;
var O="";
var R=0;
var I=!1;
var E=[];
var C=0;
if(!s||c===null)return null;
m=h(s,r,i);
f=N(s);
p=s.split("\n");
for(b=0;
b<p.length;
b+=1){T=a(p[b]);
if(!T)continue;
A=T.match(/^(TOP|JUG|JGL|JG|JUNGLE|MID|ADC|AD|BOT|SUP|SPT|SUPPORT|탑|정글|미드|원딜|바텀|서폿|서포터)\s*[.:]\s*(.*)$/i);
if(A){L=g(A[1]);
O=v(A[2]);
if(!L||!O)continue;
if(y["position:"+L])return null;
y["position:"+L]=!0;
S.push({name:O,position:L,slotNo:null,substitute:!1}
);
continue;
}A=T.match(/^(?:예비|후보|대기)\s*(\d{1,2})?\s*[.):]?\s*(.*)$/);
if(A){R=A[1]?Number(A[1]):1;
E=String(A[2]||"").split(/[,/]+/);
if(!l(R,1,99))continue;
for(C=0;
C<E.length;
C+=1){O=v(E[C].replace(/^\d{1,2}\s*[.)]\s*/,""));
if(!O)continue;
if(!l(R+C,1,99)||y["substitute:"+(R+C)])return null;
y["substitute:"+(R+C)]=!0;
S.push({name:O,position:null,slotNo:R+C,substitute:!0}
);
}continue;
}
A=T.match(/^(\d{1,2})(?:[.)]|\s+)\s*(.*)$/);
if(!A)continue;
R=Number(A[1]);
O=v(A[2]);
I=!1;
if(!O||!l(R,1,m.maximumMembers))continue;
if(y["slot:"+R])return null;
y["slot:"+R]=!0;
S.push({name:O,position:null,slotNo:R,substitute:I});
if(S.length>t)return null;
}
if(S.length<1)return null;
S.sort((function(e,r){var t=e.position?n.indexOf(e.position):100;
var i=r.position?n.indexOf(r.position):100;
if(t!==i)return t-i;
if(e.substitute!==r.substitute)return e.substitute?1:-1;
return Number(e.slotNo||0)-Number(r.slotNo||0);
}));
return{domain:"PARTY",action:"SYNC_FORM",recruitNo:c,type:m.type,title:m.title,maximumMembers:m.maximumMembers,startTimeText:f.startTimeText,tierText:f.tierText,preferredLineText:f.preferredLineText,playStyle:f.playStyle,note:f.note,members:S}
;
}function y(e){var r=o(e);
var t=r.ok?a(r.text):"";
if(!t||d(t)!==null)return!1;
if(/내전\s*(?:참가\s*)?신청|신청일\s*[:：]|회차\s*[:：]|Riot\s*ID\s*[:：]|주라인\s*[:：]/i.test(t))return!1;
if(/(^|\n)\s*(?:TOP|JUG|JGL|JG|MID|ADC|AD|SUP|탑|정글|미드|원딜|서폿|서포터)\s*[.:：]/i.test(t))return!0;
if(/(?:자랭|일반|솔랭|칼바람|증바람|기타게임|롤체\s*(?:일반|랭크)|더블업)\s*하실분/.test(t))return!0;
if(/\d{1,2}\s*인\s*(?:협곡\s*)?(?:파티\s*)?구인/.test(t))return!0;
return!1;
}
function b(e){var r=o(e);
var t=r.ok?a(r.text):"";
var n=t.replace(/\s+/g,"");
var i=null;
var u=f(t)||p(t);
if(!t)return null;
if(u)return u;
if(/^\/?(?:구인구직도움말|구인도움말|구인명령어|구인도우미|구인웹도우미|구인매뉴얼|명령어페이지)$/.test(n))return{domain:"PARTY",action:"HELP"};
i=t.match(/^\/?(?:구인상세|상세)\s*#?\s*(\d{1,2})$/);
if(i&&l(Number(i[1]),1,99))return{domain:"PARTY",action:"DETAIL",recruitNo:Number(i[1])}
;
if(/^\/?(?:현재구인구직현황|현재구인현황|구인구직현황|구인현황|현황)$/.test(n))return{domain:"PARTY",action:"STATUS"};
if(y(t))return{domain:"PARTY",action:"MISSING_NUMBER"}
;
u=S(t);
return u;
}function T(e){return e<10?"0"+e:String(e);
}
function A(e,r,t){var n=new Date(e,r-1,t);
if(n.getFullYear()!==e||n.getMonth()!==r-1||n.getDate()!==t)return null;
return String(e)+"-"+T(r)+"-"+T(t);
}function L(e){var r=e.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
return r?A(Number(r[1]),Number(r[2]),Number(r[3])):null;
}
function O(e,r){var t=e.match(/(?:^|\s)([01]?\d|2[0-3])\s*:\s*([0-5]\d)(?:\s|$)/);
if(!t)t=e.match(/(?:^|\s)([01]?\d|2[0-3])\s*시(?:\s*([0-5]?\d)\s*분?)?(?:\s|$)/);
return t?T(Number(t[1]))+":"+T(Number(t[2]||0)):r;
}function R(e){var r=a(e).replace(/\s+/g,"").toLowerCase();
if(/^(?:협곡|소환사의협곡|rift)$/.test(r))return"RIFT";
if(/^(?:칼바람|칼바람아수라장|aram)$/.test(r))return"ARAM";
if(/^(?:증바람|증바|증강칼바람|augmentaram)$/.test(r))return"AUGMENT_ARAM";
return null;
}
function I(e,r){var t=o(e);
var n=t.ok?a(t.text).replace(/^\//,""):"";
var i=null;
var u="";
n.replace(/\s+/g,"");
var l="";
var m=null;
var f=null;
var p=null;
var d=10;
if(!n||n.indexOf("\n")>=0)return null;
i=n.match(/^(?:내전구인구직|내전구인|내전모집)(?:\s+(.*))?$/i);
if(i){u=a(i[1]||"");
l=u.split(/\s+/)[0]||"";
m=R(l);
f=u.match(/(?:^|\s)#\s*(\d{1,3})(?:\s|$)/);
p=u.match(/(?:^|\s)(\d{1,2})\s*명(?:\s|$)/);
if(p)d=Math.min(Math.max(Number(p[1]),2),20);
return{domain:"INHOUSE",action:"CREATE",mode:m,dateKey:L(u)||s(r,10)||null,time:O(" "+u+" ","21:00"),recruitNo:f?c(f[1],999):null,capacity:d,templateRequest:!u,invalidMode:l&&!m&&!L(l)&&l.charAt(0)!=="#"&&!/^\d{1,2}(?::\d{2}|시|명)/.test(l)?l:null};
}
i=n.match(/^(?:내전상세)(?:\s*#?\s*(\d{1,3}))?$/);
if(i)return{domain:"INHOUSE",action:"DETAIL",recruitNo:i[1]?Number(i[1]):null};
i=n.match(/^(?:내전현황|시즌내전현황|AI공지)(?:\s*#?\s*(\d{1,3}))?$/);
if(i)return{domain:"INHOUSE",action:"STATUS",recruitNo:i[1]?Number(i[1]):null}
;
i=n.match(/^(?:내전참가|내전신청|참가신청)(?:\s*#?\s*(\d{1,3}))?$/);
if(i)return{domain:"INHOUSE",action:"JOIN",recruitNo:i[1]?Number(i[1]):null};
return null;
}
function E(e){return u(e).replace(/\s+/g,"");
}function C(e,r){var t=e.split("\n");
var n=0;
var i=0;
var u="";
var o="";
var s=null;
for(n=0;
n<t.length;
n+=1){u=a(t[n]);
for(i=0;
i<r.length;
i+=1){o=r[i].replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/\s+/g,"\\s*");
s=u.match(new RegExp("^"+o+"\\s*:\\s*(.*)$","i"));
if(s)return a(s[1])||null;
}
}return null;
}
function D(e){var r=s(e,160);
if(/^(?:미정|없음|상대구함|상대\s*구함|모집중|비워두기|공란|-)$/.test(r))return null;
return r||null;
}function G(e,r,t){var n=e.split("\n");
var i=!1;
var u=[];
var o=0;
var s="";
for(o=0;
o<n.length;
o+=1){s=a(n[o]);
if(!i&&r.test(s)){i=!0;
continue;
}
if(i&&t&&t.test(s))break;
if(i)u.push(s);
}return u.join("\n");
}
function _(e,r){var t={top:null,jungle:null,mid:null,adc:null,support:null};
var n={TOP:"top",JGL:"jungle",MID:"mid",ADC:"adc",SUP:"support"}
;
var i=e.split("\n");
var u=0;
var o=null;
var s=null;
var l="";
var c=r?"(?:"+r.join("|")+")\\s*":"";
var m=new RegExp("^"+c+"(TOP|JUG|JGL|JG|MID|ADC|AD|SUP|탑|정글|미드|원딜|서폿|서포터)\\s*[.:]\\s*(.*)$","i");
for(u=0;
u<i.length;
u+=1){o=a(i[u]).match(m);
if(!o)continue;
s=g(o[1]);
l=n[s];
if(l&&t[l]===null)t[l]=D(o[2]);
}return t;
}
function M(e){var r=e.match(/(\d{1,2}\s*판\s*\d{1,2}\s*선|\d{1,2}\s*전\s*\d{1,2}\s*선|BO\s*\d{1,2})/i);
var t=e.match(/(\d{1,2})\s*(?:판|게임|세트|전)/);
var n=t?Number(t[1]):null;
return{gameCount:l(n,1,20)?n:null,seriesRuleText:r?r[1].replace(/\s+/g,""):t?t[0].replace(/\s+/g,""):null};
}
function x(e){var r=o(e);
var t=r.ok?a(r.text):"";
var n=t.replace(/^\//,"");
var i=E(n);
var u=null;
var l=null;
var m=null;
var f="";
var p="";
var d=null;
var v=null;
var g=null;
var N=null;
var h=null;
var S=null;
var y=null;
var b=null;
var T="";
var A=null;
var R=null;
if(!t)return null;
u=i.match(/^(?:스크림참가|멸망전스크림참가)#?\d{1,3}.*$/);
if(u)return{domain:"SCRIM",action:"UNSUPPORTED",unsupportedKind:"JOIN"};
u=i.match(/^(?:스크림확정|멸망전스크림확정)#?\d{1,3}.*$/);
if(u)return{domain:"SCRIM",action:"UNSUPPORTED",unsupportedKind:"CONFIRM"}
;
u=i.match(/^(?:스크림취소|멸망전스크림취소)#?\d{1,3}.*$/);
if(u)return{domain:"SCRIM",action:"UNSUPPORTED",unsupportedKind:"CANCEL"};
u=i.match(/^(?:스크림마감|스크림종료|멸망전스크림마감|멸망전스크림종료)#?\d{1,3}.*$/);
if(u)return{domain:"SCRIM",action:"UNSUPPORTED",unsupportedKind:"FINISH"}
;
u=i.match(/^(?:스크림상세|멸망전스크림상세)#?(\d{1,3})$/);
if(u)return{domain:"SCRIM",action:"DETAIL",scrimNo:Number(u[1])};
if(/^(?:스크림현황|스크림목록|멸망전스크림현황|멸망전스크림목록)(?:#?\d{1,3})?$/.test(i)){u=i.match(/#?(\d{1,3})$/);
return{domain:"SCRIM",action:"STATUS",scrimNo:u?Number(u[1]):null}
;
}l=/^(?:스크림구인|스크림모집|멸망전스크림|멸망전스크림구인|멸망전스크림모집)/.test(i)||/\[?K-?LOL\.GG(?:멸망전)?스크림구인양식\]?/.test(i)||/일시\s*:/.test(t)&&/방식\s*:/.test(t)&&/(?:우리팀|아군팀|요청팀)\s*:/.test(t)&&/상대팀\s*:/.test(t);
if(!l)return null;
if(/^(?:스크림구인|스크림모집|멸망전스크림|멸망전스크림구인|멸망전스크림모집)$/.test(i))return{domain:"SCRIM",action:"CREATE",templateRequest:!0,operationDate:null,scrimNo:null,tournamentNo:null,requesterTeamName:null,opponentTeamName:null,requesterLineup:{top:null,jungle:null,mid:null,adc:null,support:null}
,opponentLineup:{top:null,jungle:null,mid:null,adc:null,support:null},startTimeText:null,gameCount:null,seriesRuleText:null,memo:null}
;
g=L(C(t,["운영일","운영 일자"])||"");
u=(C(t,["스크림번호","스크림 번호","번호"])||"").match(/#?\s*(\d{1,3})/);
if(!u)u=t.match(/(?:^|\n)\s*#\s*(\d{1,3})\b/);
m=u?c(u[1],999):null;
y=C(t,["멸망전번호","멸망전 번호","대회번호","대회 번호","tournamentId"]);
u=y?y.match(/\d{1,4}/):null;
R=u?Number(u[0]):null;
N=C(t,["일시","시간","시작시간","스크림일시"]);
h=C(t,["방식","판수","게임수","진행방식"]);
S=M(h||t);
f=G(t,/^\s*(?:우리팀|아군팀|요청팀)(?:명|\s*라인업|\s*명단)?\s*:/i,/^\s*상대팀(?:명|\s*라인업|\s*명단)?\s*:/i);
p=G(t,/^\s*상대팀(?:명|\s*라인업|\s*명단)?\s*:/i,/^\s*(?:메모|비고|요청사항)\s*:/i);
d=_(f);
v=_(p);
if(!(d.top||d.jungle||d.mid||d.adc||d.support))d=_(t,["우리","아군","요청"]);
if(!(v.top||v.jungle||v.mid||v.adc||v.support))v=_(t,["상대"]);
A=D(C(t,["우리팀명","우리 팀명","아군팀명","요청팀명","우리팀","요청팀"]));
if(!/\n/.test(t)){T=a(n.replace(/^(?:스크림\s*구인|스크림\s*모집|멸망전\s*스크림\s*구인|멸망전\s*스크림\s*모집)\s*/i,""));
b=T.match(/^(\d{1,4})(?:\s+|$)/);
if(b&&R===null)R=Number(b[1]);
if(b)T=a(T.substring(b[0].length));
if(!A)A=D(T.split(/\s+/)[0]||"");
}return{domain:"SCRIM",action:"CREATE",templateRequest:!1,operationDate:g,scrimNo:m,tournamentNo:R,requesterTeamName:A,opponentTeamName:D(C(t,["상대팀명","상대 팀명","상대팀"])),requesterLineup:d,opponentLineup:v,startTimeText:N||O(" "+t+" ",null),gameCount:S.gameCount,seriesRuleText:S.seriesRuleText||D(h),memo:!/\n/.test(t)?s(T,500)||null:D(C(t,["메모","비고","요청사항"]))}
;
}function P(e){return a(e).replace(/^\d+\s*[.)]\s*/,"");
}
function U(e){return a(e).replace(/\s+/g,"").replace(/[.:()\[\]{}<>·ㆍ,/\\_-]/g,"");
}function K(e,r){return U(P(e)).indexOf(U(r))===0;
}
function w(e,r){var t=e.split("\n");
var n=0;
var i=0;
var a=!1;
for(n=0;
n<r.length;
n+=1){a=!1;
for(i=0;
i<t.length;
i+=1)if(K(t[i],r[n])){a=!0;
break;
}if(!a)return!1;
}
return!0;
}function F(e,r,t){var n=e.split("\n");
var i=[];
var u=!1;
var o=0;
var s=0;
var l="";
var c=String(r).replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/\s+/g,"\\s*");
var m=new RegExp("^\\s*"+c+"\\s*[:：]?\\s*","i");
for(o=0;
o<n.length;
o+=1){l=P(n[o]);
if(!u){if(K(l,r)){i.push(a(l.replace(m,"")));
u=!0;
}
continue;
}for(s=0;
s<t.length;
s+=1)if(K(l,t[s]))break;
if(s<t.length)break;
i.push(l);
}
return a(i.join("\n"));
}function $(e,r){var t=u(e).split("\n");
var n=[];
var i=0;
var o="";
for(i=0;
i<t.length;
i+=1){o=a(t[i]).replace(/^\s*:\s*/,"").replace(/^\s*-\s*/,"").replace(/^\s*[（(][^）)]*[）)]\s*/,"");
o=a(o.replace(/\s*\*\s*(?:EX\)?|예시|선택\s*:|특별한\s*사유\s*없이는)[\s\S]*$/i,""));
if(!o||/^\(?\s*(?:소통방\s*,\s*구인방\s*,?\s*디코?|게임명\s*적기|장기\s*,\s*단기\s*,\s*특정\s*게임.*)\s*\)?$/.test(o))continue;
n.push(o);
}
o=a(n.join("\n"));
if(!o||o.length>r||/^[.:\-_/()\[\]{}\s]+$/.test(o))return"";
return o;
}function k(e,r){var t=$(e,180);
var n=s(r,100)||"카카오 사용자";
var i=t?t.split(/\s*(?:\/|\||,|·)\s*/):[];
var a=s(i[0]||n,100)||n.substring(0,100);
var u=s(i[1]||i[0]||n,64)||n.substring(0,64);
return{name:a,nickname:u}
;
}function j(e){var r=U(e).toLowerCase();
if(/^(?:x|아니오|아니요|안함|변경안함|없음|no|false)$/.test(r))return!1;
return /(?:o|예|네|변경|yes|true)/.test(r);
}
function B(e){var r=u(e).split(/\n|,/);
var t=[];
var n={};
var i=0;
var a="";
for(i=0;
i<r.length;
i+=1){a=s(r[i].replace(/^\s*[-*]?\s*\d*\s*[.)]?\s*/,""),100);
if(!a||n[a])continue;
n[a]=!0;
t.push(a);
if(t.length>30)return[];
}
return t;
}function V(e){var r=$(e,160);
var t=r.match(/20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}/g)||[];
var n=t[0]?L(t[0]):null;
var i=t[1]?L(t[1]):n;
if(n&&i&&i>=n)return{periodStart:n,periodEnd:i,legacyPeriodText:null}
;
return r?{periodStart:null,periodEnd:null,legacyPeriodText:r}:null;
}
function J(e){var r=$(e,160);
var t=u(e).replace(/\s+/g,"");
var n=[];
if(/소통방/.test(t))n.push("소통방");
if(/구인방/.test(t))n.push("구인방");
if(/디코|디스코드/.test(t))n.push("디코");
return n.length?n.join(", "):r;
}function H(e,r){var t=o(e);
var n=t.ok?a(t.text):"";
var i=null;
var u=null;
var s=null;
var l=null;
var c=null;
if(!n)return null;
if(w(n,["지인 이름","지인 닉네임","이용기간","디스코드 닉네임 변경"])){i=k("",r);
c={applicantName:i.name,applicantNickname:i.nickname,friendName:$(F(n,"지인 이름",["지인 닉네임","이용기간","디스코드 닉네임 변경"]),100),friendNickname:$(F(n,"지인 닉네임",["이용기간","디스코드 닉네임 변경"]),64),usagePeriod:$(F(n,"이용기간",["디스코드 닉네임 변경"]),160),discordNicknameChange:j(F(n,"디스코드 닉네임 변경",[]))}
;
if(!c.friendName||!c.friendNickname||!c.usagePeriod)return null;
return{domain:"OPERATION_FORM",action:"SUBMIT",formType:"friends",payload:c};
}
if(w(n,["본인 이름 및 닉네임","건의 사유","건의 내용"])){i=k(F(n,"본인 이름 및 닉네임",["건의 사유","건의 내용"]),r);
c={applicantName:i.name,applicantNickname:i.nickname,reason:$(F(n,"건의 사유",["건의 내용"]),500),content:$(F(n,"건의 내용",[]),4e3)};
if(!c.reason||!c.content)return null;
return{domain:"OPERATION_FORM",action:"SUBMIT",formType:"suggestions",payload:c}
;
}if(w(n,["주최자 이름 및 닉네임","일자","장소","참여자 명단"])){i=k(F(n,"주최자 이름 및 닉네임",["일자","장소","참여자 명단"]),r);
u=$(F(n,"일자",["장소","참여자 명단"]),160);
l=B(F(n,"참여자 명단",[]));
c={hostName:i.name,hostNickname:i.nickname,meetupAt:null,legacyDateText:u,location:$(F(n,"장소",["참여자 명단"]),240),participants:l}
;
if(!c.legacyDateText||!c.location||l.length<1)return null;
return{domain:"OPERATION_FORM",action:"SUBMIT",formType:"meetups",payload:c};
}
if(w(n,["이름 및 닉네임","외출기간","외출사유","외출범위"])){i=k(F(n,"이름 및 닉네임",["외출기간","외출사유","외출범위"]),r);
s=V(F(n,"외출기간",["외출사유","외출범위"]));
if(!s)return null;
c={applicantName:i.name,applicantNickname:i.nickname,periodStart:s.periodStart,periodEnd:s.periodEnd,reason:$(F(n,"외출사유",["외출범위"]),1e3),scope:J(F(n,"외출범위",[]))};
if(s.legacyPeriodText)c.legacyPeriodText=s.legacyPeriodText;
if(!c.reason||!c.scope)return null;
return{domain:"OPERATION_FORM",action:"SUBMIT",formType:"leaves",payload:c}
;
}return null;
}
function Y(e){var r=o(e);
var t=r.ok?a(r.text):"";
var n=t.replace(/\s+/g,"");
if(!t)return null;
if(t.charAt(0)==="["&&t.indexOf("양식")>=0&&/\sv\d+/i.test(t)){if(/징계|경고/.test(t))return{domain:"MANAGED",action:"DISCIPLINE_CREATE"};
if(/내전|경기|결과/.test(t))return{domain:"MANAGED",action:"INHOUSE_RESULT"}
;
return{domain:"MANAGED",action:"REGISTRATION_HUB"};
}
if(t.indexOf("\n")>=0)return null;
if(/^\/?(?:등록|등록도움말)$/.test(n))return{domain:"MANAGED",action:"REGISTRATION_HUB"};
if(/^\/?(?:사진취소|V2사진취소)$/.test(n))return{domain:"MANAGED",action:"PHOTO_CANCEL"}
;
if(/^\/?(?:내전등록|결과등록|내전결과)(?:\s+.+)?$/.test(t))return{domain:"MANAGED",action:"INHOUSE_RESULT"};
if(/^\/?(?:내전등록현황|결과현황)(?:\s+.+)?$/.test(t)||/^\/?내전현황\s+MR[A-F0-9]{10,16}$/i.test(t))return{domain:"MANAGED",action:"INHOUSE_RESULT_STATUS"}
;
if(/^\/?(?:경고등록|경고)(?:\s+.+)?$/.test(t))return{domain:"MANAGED",action:"DISCIPLINE_CREATE"};
if(/^\/?(?:인증|경고인증|경고인증완료)(?:\s+.+)?$/.test(t))return{domain:"MANAGED",action:"DISCIPLINE_EVIDENCE"}
;
if(/^\/?경고현황(?:\s+.+)?$/.test(t))return{domain:"MANAGED",action:"DISCIPLINE_STATUS"};
return null;
}
function q(e,r,t){var n=o(e);
var i=null;
if(!n.ok)return{domain:"INPUT",action:"REJECT",error:n.error};
i=Y(n.text);
if(i)return i;
i=H(n.text,r);
if(i)return i;
i=I(n.text,t);
if(i)return i;
i=x(n.text);
if(i)return i;
return b(n.text);
}
return{VERSION:"KLOL_V41_V1_COMPAT_2026_09_09_V40_PARITY",limits:{maximumInputLength:e,maximumInputLines:r,maximumMembers:t},normalizeText:u,validateInput:o,parsePartyCreateCommand:f,parsePartyFinishCommand:p,parsePartyForm:S,isPartyFormWithoutNumber:y,classifyPartyCommand:b,parseInhouseCommand:I,parseScrimCommand:x,parseOperationForm:H,classifyManagedCommand:Y,classifyMessage:q}
;
}();
if(typeof module!="undefined"&&module.exports)module.exports=r;
var t="KLOL_KAKAO_BOT_V41_V2_2026_09_09_R6_V1_EXACT";
var n=6e5;
var i=18e5;
function a(e){return String(e==null?"":e).replace(/^\s+|\s+$/g,"");
}
function u(e){return Object.prototype.toString.call(e)==="[object Array]";
}function o(e){return String(e==null?"":e).replace(/[\u200b-\u200d\u2060\ufeff]/g,"").replace(/\r\n?/g,"\n").replace(/[\u00a0\u3000]/g," ").replace(/／/g,"/").replace(/，/g,",").replace(/：/g,":").replace(/＃/g,"#").replace(/．/g,".").replace(/[–—]/g,"-").replace(/０/g,"0").replace(/１/g,"1").replace(/２/g,"2").replace(/３/g,"3").replace(/４/g,"4").replace(/５/g,"5").replace(/６/g,"6").replace(/７/g,"7").replace(/８/g,"8").replace(/９/g,"9");
}
function s(e){var r=a(e);
return r.indexOf("오픈채팅봇")>=0||r.indexOf("K-LOL")>=0||r.indexOf("구인구직 도우미")>=0||r.indexOf("구인도우미")>=0;
}function l(e){try{return a(String(DataBase.getDataBase(e)||""));
}
catch(e){return"";
}}
function c(r){try{return e.publicBaseUrl()+String(r||"");
}catch(e){return"KLOL_V2_BASE_URL 설정 후 열기: "+String(r||"/");
}
}function m(e,r){if(e&&e.reply)e.reply(String(r));
return!0;
}
function f(e){var r=new Error(String(e));
r.v41UserSafe=!0;
return r;
}function p(r){var t=r&&r.body;
var n=t&&typeof t.detail=="string"?String(t.detail):"";
if(!(r&&r.ok||n.indexOf("[K-LOL.GG 요청 실패]")!==0))return n;
if(t&&typeof t.legacyReply=="string"&&a(t.legacyReply))return String(t.legacyReply);
return e.userMessage(r);
}
function d(){var e=new java.text.SimpleDateFormat("yyyy-MM-dd");
e.setTimeZone(java.util.TimeZone.getTimeZone("Asia/Seoul"));
return String(e.format(new java.util.Date));
}function v(e){var r=String(e||"").match(/회차\s*[:：]\s*#?\s*(\d{1,3})/);
if(!r)r=String(e||"").match(/#\s*(\d{1,3})/);
var t=r?Number(r[1]):1;
return t>=1&&t<=999?t:1;
}
function g(){var e=l("KLOL_V2_ACTIVE_SEASON_ID");
if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(e))throw new Error("V2 활성 시즌 ID 설정을 확인해 주세요.");
return e;
}function N(e){return{TOP:"탑",JGL:"정글",MID:"미드",ADC:"원딜",SUP:"서포터"}
[String(e||"")]||String(e||"미정");
}function h(e){var r=Number(e||0);
if(!isFinite(r))r=0;
return String(Math.round(r*10)/10).replace(/\.0$/,"")+"%";
}
function S(e){if(!e||!e.ok)return p(e);
var r=e.body&&typeof e.body=="object"?e.body:{};
if(typeof r.legacyReply=="string"&&a(r.legacyReply))return String(r.legacyReply);
if(typeof r.reply=="string"&&a(r.reply))return String(r.reply);
var t=u(r.recentMatches)?r.recentMatches:[];
var n=r.mode==="RECENT"?"RECENT":"RECORD";
var i=r.player?String(r.player.riotId||r.player.displayName||"플레이어"):"플레이어";
var o=[n==="RECENT"?"["+i+" 최근 경기]":"["+i+" 전적]",""];
var s=0;
if(!r.player)return o[0]+"\n\n일치하는 플레이어를 찾지 못했습니다.";
if(n==="RECORD"){if(r.season)o.push("시즌: "+r.season.name);
if(r.currentTier||r.peakTier)o.push("티어: "+String(r.currentTier||"-")+" / "+String(r.peakTier||"-"));
if(r.summary){o.push("참여: "+Number(r.summary.participationCount||0)+"회 / "+Number(r.summary.totalGames||0)+"세트");
o.push("전적: "+Number(r.summary.wins||0)+"승 "+Number(r.summary.losses||0)+"패 ("+h(r.summary.winRate)+")");
o.push("KDA: "+Number(r.summary.kda||0).toFixed(2)+" ("+Number(r.summary.kills||0)+"/"+Number(r.summary.deaths||0)+"/"+Number(r.summary.assists||0)+")");
o.push("MVP: "+Number(r.summary.mvpCount||0)+"회");
}
else o.push("집계된 시즌 전적이 없습니다.");
if(t.length){o.push("");
o.push("최근: "+(t[0].won===!0?"승":"패")+" "+String(t[0].championName||"챔피언 미정")+" "+Number(t[0].kills||0)+"/"+Number(t[0].deaths||0)+"/"+Number(t[0].assists||0));
}}
else{for(s=0;
s<t.length&&s<10;
s+=1)o.push(s+1+". "+(t[s].won===!0?"승":"패")+" | "+String(t[s].championName||"챔피언 미정")+" | "+Number(t[s].kills||0)+"/"+Number(t[s].deaths||0)+"/"+Number(t[s].assists||0));
if(!t.length)o.push("표시할 최근 경기가 없습니다.");
}o.push("",c("/players/"+r.player.playerId));
return o.join("\n");
}
function y(e){if(!e||!e.ok)return p(e);
var r=e.body&&typeof e.body=="object"?e.body:{};
if(typeof r.legacyReply=="string"&&a(r.legacyReply))return String(r.legacyReply);
if(typeof r.reply=="string"&&a(r.reply))return String(r.reply);
var t=u(r.rows)?r.rows:[];
var n=["🏆 K-LOL.GG 랭킹 TOP 5","기준: 내전 참여 "+Number(r.minimumParticipation||0)+"회 이상",""];
var i=0;
for(i=0;
i<t.length&&i<5;
i+=1){var o=t[i];
n.push(Number(o.rank||i+1)+". "+String(o.riotId||o.displayName)+" | 승률 "+h(o.winRate)+" | 참여 "+Number(o.participationCount||0)+"회 | "+Number(o.totalGames||0)+"세트 | KDA "+Number(o.kda||0).toFixed(2));
}
if(!t.length)n.push("표시할 랭킹 기록이 없습니다.");
return n.join("\n");
}function b(e){if(!e||!e.ok)return p(e);
var r=e.body&&typeof e.body=="object"?e.body:{}
;
var t=r.positionCounts&&typeof r.positionCounts=="object"?r.positionCounts:{};
var n=u(r.shortagePositions)?r.shortagePositions:[];
var i=[];
var a=0;
for(a=0;
a<n.length;
a+=1)i.push(N(n[a]));
return["[K-LOL.GG 내전 공지 미리보기]","읽기 전용 미리보기이며 실제 방 자동 발송은 하지 않았습니다.","날짜: "+String(r.date||"오늘")+(r.slot?" · 시간: "+String(r.slot)+"시":""),r.seasonId?"활성 시즌 신청 현황":"활성 시즌이 없습니다.","신청 "+Number(r.total||0)+"/"+Number(r.targetCount||10)+" · 남은 인원 "+Number(r.remaining||0)+"명","포지션: 탑 "+Number(t.TOP||0)+" · 정글 "+Number(t.JGL||0)+" · 미드 "+Number(t.MID||0)+" · 원딜 "+Number(t.ADC||0)+" · 서포터 "+Number(t.SUP||0),"부족 포지션: "+(i.length?i.join(", "):"없음")].join("\n");
}
function T(e){var r=String(e&&e.type||"");
if(r==="FLEX_RANK")return"자랭";
if(r==="NORMAL_GAME")return"일반";
if(r==="SOLO_RANK")return"솔랭";
if(r==="ARAM")return String(e.title||"").indexOf("증바람")>=0?"증바람":"칼바람";
if(r==="TFT_NORMAL")return"롤체 일반";
if(r==="TFT_RANK")return"롤체 랭크";
if(r==="DOUBLE_UP")return"더블업";
if(r==="PARTY_RIFT")return"5인 협곡";
if(r==="OTHER_GAME")return"기타게임";
return Number(e&&e.maximumMembers||0)+"인 파티";
}function A(e){var r=a(e&&e.startTimeText);
var t=e&&e.scheduledStartAt;
var n=null;
if(r)return r;
if(!t)return"미정";
n=String(t).match(/T(\d{2}):(\d{2})/);
return n?n[1]+":"+n[2]:"미정";
}
function L(e){var r=e&&u(e.members)?e.members:[];
var t=[];
var n=0;
for(n=0;
n<r.length;
n+=1)if(!r[n].substitute&&r[n].name)t.push(String(r[n].name));
return t;
}function O(e){var r=a(e&&e.note);
return"#"+Number(e.recruitNumber)+" · "+T(e)+" · "+Number(e.memberCount||0)+"/"+Number(e.maximumMembers||0)+" · "+A(e)+(r?" · "+r:"");
}
function R(e){var r=e&&e.body;
var t=r&&u(r.parties)?r.parties:[];
var n=["[K-LOL.GG 구인구직 현황]"];
var i=[];
var a=0;
if(!e||!e.ok)return p(e);
if(!t.length)return n.concat(["","현재 진행 중인 구인글이 없습니다."]).join("\n");
n.push("🔎 전체 명단: 상세 번호","","[구인중]");
for(a=0;
a<t.length;
a+=1){n.push(O(t[a]));
i=L(t[a]);
if(i.length)n.push("참여: "+i.join(", "));
n.push("└ 상세 "+Number(t[a].recruitNumber));
if(a+1<t.length)n.push("");
}return n.join("\n");
}
function I(e){var r=e&&e.body;
var t=r&&u(r.parties)?r.parties:[];
var n=r&&u(r.scrims)?r.scrims:[];
var i=["[K-LOL.GG 구인 현황]"];
var a=0;
if(!e||!e.ok)return p(e);
for(a=0;
a<t.length;
a+=1)i.push("파티 #"+t[a].recruitNumber+" · "+t[a].title+" · "+t[a].memberCount+"/"+t[a].maximumMembers+(Number(t[a].reserveCount||0)?" · 예비 "+Number(t[a].reserveCount):""));
for(a=0;
a<n.length;
a+=1)i.push("스크림 #"+n[a].scrimNumber+" · "+n[a].status+" · BO"+n[a].bestOf);
if(i.length===1)i.push("현재 진행 중인 모집이 없습니다.");
return i.join("\n");
}function E(e,r){var t=String(e.title||Number(e.maximumMembers)+"인 파티 구인");
var n=["[K-LOL.GG 구인구직 양식]","같이 할사람~","","아래 양식의 모집번호는 유지해서 작성해주세요.","","📢 "+t,"모집번호: #"+Number(r),"","》시작시간 :","》게임정보 :",""];
var i=["TOP.","JUG.","MID.","ADC.","SUP."];
var a=e.type==="FLEX_RANK"||e.type==="NORMAL_GAME"||e.type==="PARTY_RIFT";
var u=0;
if(a){for(u=0;
u<i.length;
u+=1)n.push(i[u]);
n.push("예비 1.","","마지막 참가자가 전체 태그 해주세요.","*상호배려와 존중 부탁드립니다.");
}
else{for(u=1;
u<=Number(e.maximumMembers);
u+=1)n.push(u+".");
n.push("예비 1.","","참여해주실 분은 태그해주세요.","*상호배려와 존중 부탁드립니다.");
}return n.join("\n");
}
function C(e){return a(e).replace(/[\r\n|]+/g," ").replace(/\s+/g," ");
}function D(e){return{APPLIED:"신청",RESERVE:"예비",CONFIRMED:"확정",REJECTED:"거절",CANCELLED:"취소",MATCHED_RESERVE:"예비 · 확인 필요",UNMATCHED:"플레이어 확인 필요",AMBIGUOUS:"동명이인 확인 필요"}
[String(e||"")]||C(e);
}function G(e){var r=e&&e.body;
var t=r&&u(r.entries)?r.entries:[];
var n=["[K-LOL.GG 내전 참가 신청]"];
var i=0;
if(!e||!e.ok)return p(e);
if(r&&typeof r.legacyReply=="string"&&a(r.legacyReply))return String(r.legacyReply);
n.push("신청일: "+r.applyDate);
n.push("회차: #"+r.recruitNo);
n.push("신청 "+Number(r.appliedCount||0)+" · 예비 "+Number(r.reserveCount||0)+" · 확정 "+Number(r.confirmedCount||0)+" · 확인 필요 "+Number(r.pendingCount||0));
for(i=0;
i<t.length;
i+=1){var o=t[i];
var s=o.player?o.player.displayName:o.suppliedName;
var l=o.player?o.player.riotId:o.suppliedRiotId;
var c=u(o.subPositions)&&o.subPositions.length?o.subPositions.join(", "):"없음";
n.push(o.slotNo+". 플레이어: "+C(s)+" | Riot ID: "+C(l||"없음")+" | 주라인: "+C(o.mainPosition||"ALL")+" | 부라인: "+C(c)+" | 상태: "+D(o.status)+" | 출처: "+(o.source==="SITE"?"SITE":"KAKAO"));
}
return n.join("\n");
}function _(e){var r=a(e).toUpperCase();
if(r==="탑"||r==="T")return"TOP";
if(r==="정글"||r==="JG"||r==="JUG")return"JGL";
if(r==="미드"||r==="MD"||r==="M")return"MID";
if(r==="원딜"||r==="AD"||r==="원딜러")return"ADC";
if(r==="서폿"||r==="서포터"||r==="S")return"SUP";
if(r==="올"||r==="전체"||r==="FILL")return"ALL";
if(/^(TOP|JGL|MID|ADC|SUP|ALL)$/.test(r))return r;
return null;
}
function M(e){var r=String(e||"").replace(/\r\n?/g,"\n").split("\n");
var t=[];
var n=0;
for(n=0;
n<r.length;
n+=1){var i=a(r[n]).match(/^(\d{1,2})\s*[.)]\s*(.+)$/);
if(!i||/^(?:EX|예시)/i.test(i[2]))continue;
if(i[2].indexOf("플레이어:")>=0||i[2].indexOf("플레이어：")>=0){var u=i[2].split("|");
var o={};
var s=0;
for(s=0;
s<u.length;
s+=1){var l=a(u[s]).match(/^([^:：]+)\s*[:：]\s*(.*)$/);
if(l)o[a(l[1]).toLowerCase()]=a(l[2]);
}
var c=o["플레이어"]||o["이름"];
var m=o["riot id"]||o["라이엇 id"]||null;
var f=_(o["주라인"]||o["주 포지션"]);
var p=[];
var d=String(o["부라인"]||o["부 포지션"]||"").split(/[,，]/);
var v=0;
if(!c||!f)throw new Error(i[1]+"번 신청자의 플레이어 또는 주라인을 확인해 주세요.");
for(v=0;
v<d.length;
v+=1){var g=a(d[v]);
if(!g||/^(?:없음|-)$/.test(g))continue;
var N=_(g);
if(!N||N===f||N==="ALL"||p.indexOf(N)>=0)throw new Error(i[1]+"번 신청자의 부라인을 확인해 주세요.");
p.push(N);
}if(f==="ALL"&&p.length)throw new Error(i[1]+"번 신청자의 부라인을 확인해 주세요.");
if(m&&/^(?:없음|-)$/.test(m))m=null;
t.push({slotNo:Number(i[1]),name:c,riotId:m,mainPosition:f,subPositions:p,reserve:/(?:예비|대기|MATCHED_RESERVE|RESERVE)/i.test(o["상태"]||"")}
);
continue;
}if(i[2].indexOf("/")<0)continue;
var h=i[2].split("/");
if(h.length<4)continue;
var S=a(h[0]);
var y=a(h.slice(3).join("/")).split(/[\/,，]/);
var b=_(y[0]);
if(!S||!b)throw new Error(i[1]+"번 신청자의 이름 또는 포지션을 확인해 주세요.");
var T=[];
var A=1;
for(A=1;
A<y.length;
A+=1){var L=_(y[A]);
if(L&&L!==b&&L!=="ALL"&&T.indexOf(L)<0)T.push(L);
}
t.push({slotNo:Number(i[1]),name:S,riotId:null,mainPosition:b,subPositions:T,reserve:/(?:예비|대기)/.test(i[2])});
}
if(!t.length)throw new Error("내전 신청자 줄을 찾지 못했습니다.");
return t;
}function x(e){var r=String(e||"").match(/(20\d{2}-\d{2}-\d{2})/);
return r?r[1]:d();
}
function P(e){var r=o(e).split("\n");
var t=[];
var n=0;
for(n=0;
n<r.length;
n+=1){if(/^\s*\d{1,2}\s*[.)]/.test(r[n]))break;
t.push(r[n]);
}return t.join("\n");
}
function U(e){var r=P(e);
var t=r.match(/(?:신청일|날짜|일자)\s*[:：]\s*(20\d{2}-\d{2}-\d{2})/);
if(!t)throw f("내전 전체 양식에 신청일: YYYY-MM-DD를 적어 주세요.");
var n=new Date(t[1]+"T00:00:00Z");
if(isNaN(n.getTime())||n.toISOString().substring(0,10)!==t[1])throw f("내전 전체 양식의 신청일을 확인해 주세요.");
return t[1];
}function K(e){var r=P(e);
var t=r.match(/회차\s*[:：]\s*#?\s*(\d{1,3})/);
if(!t)t=r.match(/내전\s*(?:번호|NO)\s*[:：]?\s*#?\s*(\d{1,3})/i);
if(!t)t=r.match(/(?:협곡\s*)?내전[^\n#]*#\s*(\d{1,3})/);
var n=t?Number(t[1]):0;
if(!n||n<1||n>999)throw f("내전 전체 양식에 회차: #번호를 적어 주세요.");
return n;
}
function w(e){var r=JSON.stringify(e);
var t=2166136261;
var n=0;
for(n=0;
n<r.length;
n+=1){t^=r.charCodeAt(n);
t=Math.imul?Math.imul(t,16777619):t*16777619|0;
}return("00000000"+(t>>>0).toString(16)).slice(-8).toUpperCase();
}
function F(r,t){var n=e.identityForChat(r,t);
return"KLOL_V41_SEASON_PREVIEW_"+n.roomId.substring(5)+"_"+n.senderId.substring(7);
}function $(e,r){try{DataBase.setDataBase(F(e,r),"");
}
catch(e){}}
function k(e,r,t){DataBase.setDataBase(F(e,r),JSON.stringify(t));
}function j(e,r){var t=null;
try{t=JSON.parse(String(DataBase.getDataBase(F(e,r))||"null"));
}
catch(e){}if(!t||typeof t!="object"||typeof t.code!="string"||typeof t.createdAt!="number"||typeof t.applyDate!="string"||typeof t.recruitNo!="number"||!u(t.participants)){$(e,r);
return null;
}
if((new Date).getTime()-t.createdAt>n){$(e,r);
return null;
}return t;
}
function B(r,t,n){var i=U(n);
var a=K(n);
var u=M(n);
var o={};
var s=0;
if(u.length>99)throw f("내전 전체 양식은 회차당 최대 99명까지 확인할 수 있습니다.");
for(s=0;
s<u.length;
s+=1){if(o[String(u[s].slotNo)])throw f("내전 전체 양식에 중복된 번호가 있습니다.");
o[String(u[s].slotNo)]=!0;
}
var l={applyDate:i,recruitNo:a,participants:u};
var c=w(l);
var m=String(e.newUuid()).replace(/-/g,"").substring(0,6).toUpperCase();
var p={code:m,createdAt:(new Date).getTime(),applyDate:i,recruitNo:a,participants:u,count:u.length,hash:c}
;
k(r,t,p);
return["[K-LOL.GG 내전 신청 미리보기]","아직 사이트에 반영하지 않았습니다.","신청일: "+i+" · 회차: #"+a,"인원: "+u.length+"명 · 요약 해시: "+c,"10분 안에 /내전확인 "+m+" 를 보내면 한 번만 반영합니다.","취소: /내전미리보기취소","주의: 확인하면 이 전체 양식에서 빠진 기존 카카오 신청은 취소될 수 있습니다."].join("\n");
}function V(r,t,n,i){var a=j(r,t);
if(!a)return m(i,"[K-LOL.GG 내전 신청]\n확인할 미리보기가 없거나 10분이 지났습니다. 전체 양식을 다시 보내 주세요.");
if(a.code!==String(n||"").toUpperCase())return m(i,"[K-LOL.GG 내전 신청]\n확인 코드가 일치하지 않습니다. 미리보기의 코드를 확인해 주세요.");
$(r,t);
var u=e.seasonApplications({action:"SYNC",seasonId:g(),applyDate:a.applyDate,recruitNo:a.recruitNo,participants:a.participants}
,e.contextFromChat(r,t));
return m(i,G(u));
}function J(e){var r=o(e);
return /내전하실분\s*#\s*\d{1,3}/.test(r)&&/참가\s*신청\s*양식/.test(r)&&/이름\s*\/\s*현티어\s*\/\s*최고티어/.test(r)&&/^\s*\d{1,2}\s*[.)]/m.test(r);
}
function H(r,t,n){var i=e.identityForChat(r,t);
return"KLOL_V41_V1_SEASON_SYNC_"+i.roomId.substring(5)+"_"+i.senderId.substring(7)+"_"+w(o(n));
}function Y(r,t,n,i){var a=H(t,n,r);
if(String(DataBase.getDataBase(a)||"")==="done")return!0;
var u=x(r);
var s=K(r);
var l=M(r);
var c=e.seasonApplications({action:"SYNC",seasonId:g(),applyDate:u,recruitNo:s,participants:l}
,e.contextFromChat(t,n,{requestKey:"mbr-v41-v1-season-"+w(o(r)).toLowerCase()}));
if(c&&c.ok)DataBase.setDataBase(a,"done");
return m(i,G(c));
}
function q(e,r){var t=JSON.parse(a(String(e).substring(r.length)));
if(!t||typeof t!="object"||u(t))throw new Error("JSON 객체 형식을 확인해 주세요.");
return t;
}function X(e){return String(e||"").indexOf("SCRIM")>=0?"SCRIM":"PARTY";
}
function Z(r,t){var n=e.identityForChat(r,"recruit-state");
return"KLOL_V41_RECRUIT_"+t+"_"+n.roomId.substring(5);
}function z(e,r){try{var t=JSON.parse(String(DataBase.getDataBase(Z(e,r))||"null"));
if(t&&typeof t.aggregateId=="string"&&typeof t.revision=="number")return t;
}
catch(e){}return null;
}
function W(e,r,t){var n=t&&t.body;
if(!t||!t.ok||!n||typeof n.aggregateId!="string"||typeof n.revision!="number")return;
DataBase.setDataBase(Z(e,r),JSON.stringify({aggregateId:n.aggregateId,revision:n.revision,status:n.status}));
}
function Q(r,t,n,i){var a=q(r,"/V2모집");
var u=String(a.type||"");
var o=X(u);
var s=u.indexOf("CREATE_")===0;
var l=s?null:z(t,o);
var c=typeof a.aggregateId=="string"?a.aggregateId:l?l.aggregateId:"";
var f=typeof a.expectedRevision=="number"?a.expectedRevision:s?0:l?l.revision:-1;
if(s&&!c)c=e.newUuid();
if(!c||f<0)throw new Error("모집 ID 또는 최신 revision을 확인해 주세요.");
var d={type:u,aggregateId:c,payload:a.payload};
var v=e.recruit(d,e.contextFromChat(t,n,{expectedRevision:f}
));
W(t,o,v);
m(i,p(v));
}function ee(){if(typeof r=="undefined"||!r||!r.classifyMessage)throw new Error("V1 호환 파서가 로드되지 않았습니다.");
return r;
}
function re(r,t,n){var i=e.identityForChat(r,t);
return"KLOL_V41_INTENT_"+i.roomId.substring(5)+"_"+i.senderId.substring(7)+"_"+w(o(n));
}function te(e,r,t){var i=re(e,r,t);
var a=(new Date).getTime();
var u=null;
try{u=JSON.parse(String(DataBase.getDataBase(i)||"null"));
}
catch(e){}if(u&&typeof u=="object"&&typeof u.createdAt=="number"&&a-u.createdAt>=0&&a-u.createdAt<=n&&typeof u.requestKey=="string")return u;
return null;
}
function ne(r,t,n,i){var a=re(r,t,n);
var u=(new Date).getTime();
var o=te(r,t,n);
if(o)return o;
o=i();
o.createdAt=u;
o.requestKey="mbr-v41-legacy-"+w({room:e.identityForChat(r,t).roomId,sender:e.identityForChat(r,t).senderId,text:n,createdAt:u}).toLowerCase();
DataBase.setDataBase(a,JSON.stringify(o));
return o;
}
function ie(r,t){var n=e.openchatStatus(e.contextFromChat(r,t));
if(!n||!n.ok||!n.body||typeof n.body!="object")throw f(p(n));
return n;
}function ae(e,r){var t=e&&e.body&&u(e.body.parties)?e.body.parties:[];
var n=d();
var i=0;
for(i=0;
i<t.length;
i+=1)if(String(t[i].recruitDate||n)===n&&Number(t[i].recruitNumber)===Number(r))return t[i];
return null;
}
function ue(e,r){var t=e&&e.body&&u(e.body.scrims)?e.body.scrims:[];
var n=d();
var i=0;
for(i=0;
i<t.length;
i+=1)if(String(t[i].recruitDate||n)===n&&Number(t[i].scrimNumber)===Number(r))return t[i];
return null;
}function oe(e){var r=u(e.members)?e.members:[];
var t={TOP:1,JGL:2,MID:3,ADC:4,SUP:5}
;
var n=[];
var i=0;
for(i=0;
i<r.length;
i+=1){if(!r[i].name||String(r[i].name).length>80)throw f("참가자 이름은 80자 이내로 적어 주세요.");
n.push({name:String(r[i].name),position:r[i].position||null,slotNo:Number(r[i].slotNo||t[r[i].position]||i+1),substitute:r[i].substitute===!0});
}
return n;
}function se(e,r){var t=String(r||"").match(/(?:^|\s)((?:[01]?\d|2[0-3]):[0-5]\d)(?:\s|$)/);
if(!t)return null;
var n=new Date(e+"T"+String(t[1]).replace(/^(\d):/,"0$1:")+":00+09:00");
return isNaN(n.getTime())?null:n.toISOString();
}
function le(e){var r=e&&u(e.members)?e.members:[];
var t=["[K-LOL.GG 파티 #"+Number(e.recruitNumber)+"]",String(e.title||"파티 구인")];
var n=0;
t.push("인원 "+Number(e.memberCount||0)+"/"+Number(e.maximumMembers||0)+(Number(e.reserveCount||0)?" · 예비 "+Number(e.reserveCount):""));
for(n=0;
n<r.length;
n+=1)t.push((r[n].substitute?"예비 ":"")+Number(r[n].slotNo||n+1)+". "+String(r[n].name||"이름 미정")+(r[n].position?" · "+N(r[n].position):""));
if(!r.length)t.push("아직 참가자가 없습니다.");
return t.join("\n");
}function ce(e){return{RECRUITING:"모집중",MATCHED:"매칭완료",CONFIRMED:"확정",COMPLETED:"완료",CANCELED:"취소",CANCELLED:"취소"}
[String(e||"")]||String(e||"");
}function me(e){var r=e&&e.startTimeText?String(e.startTimeText):"미정";
var t=e&&e.scheduledAt?new Date(e.scheduledAt):null;
if(!t||isNaN(t.getTime()))return r;
var n=new Date(t.getTime()+324e5);
var i=String(n.getUTCHours());
var a=String(n.getUTCMinutes());
if(i.length<2)i="0"+i;
if(a.length<2)a="0"+a;
return String(n.getUTCMonth()+1)+"/"+String(n.getUTCDate())+" "+i+":"+a;
}
function fe(e){return String(e.seriesRuleText||(e.bestOf?Number(e.bestOf)+"판":"판수 미정"));
}function pe(e){return"#"+Number(e.scrimNumber)+" "+String(e.requesterTeamName||"요청팀 미정")+" vs "+String(e.opponentTeamName||"상대구함")+" / "+me(e)+" / "+fe(e)+" / "+ce(e.status);
}
function de(e){var r=e&&e.body;
var t=r&&u(r.scrims)?r.scrims:[];
var n=["[K-LOL.GG 스크림 현황]"];
var i=0;
if(!e||!e.ok)return p(e);
if(!t.length)return n.concat(["","현재 모집중/확정된 스크림이 없습니다."]).join("\n");
n.push("🔎 전체 양식: 스크림상세 번호","");
for(i=0;
i<t.length;
i+=1){n.push(pe(t[i]));
n.push("└ 스크림상세 "+Number(t[i].scrimNumber));
}return n.join("\n");
}
function ve(e){var r=e.requesterLineup||{};
var t=e.opponentLineup||{}
;
return["운영일: "+String(e.recruitDate||d()),"번호: #"+Number(e.scrimNumber),"일시: "+me(e),"방식: "+fe(e),"","우리팀: "+String(e.requesterTeamName||""),"TOP: "+String(r.top||""),"JUG: "+String(r.jungle||""),"MID: "+String(r.mid||""),"ADC: "+String(r.adc||""),"SUP: "+String(r.support||""),"","상대팀: "+String(e.opponentTeamName||""),"TOP: "+String(t.top||""),"JUG: "+String(t.jungle||""),"MID: "+String(t.mid||""),"ADC: "+String(t.adc||""),"SUP: "+String(t.support||"")];
}function ge(e){var r=["[K-LOL.GG 멸망전 스크림 상세]","",pe(e),""];
r=r.concat(ve(e));
r.push("","수정: 이 메시지를 복사해 내용을 고친 뒤 전체 전송");
return r.join("\n");
}
function Ne(r,t,n,i){var a=ne(r,t,n,i);
var u=e.recruit(a.command,e.contextFromChat(r,t,{expectedRevision:Number(a.expectedRevision),requestKey:a.requestKey}));
W(r,X(a.command.type),u);
return u;
}
function he(r,t,n,i,a){var u=null;
var o=null;
var s=null;
if(r.action==="HELP")return m(a,Ke());
if(r.action==="MISSING_NUMBER")return m(a,["[K-LOL.GG 양식 확인 필요]","모집번호를 찾지 못했습니다.","봇이 출력한 원본 양식의 ‘모집번호: #번호’를 유지해서 다시 보내 주세요."].join("\n"));
u=ie(n,i);
if(r.action==="STATUS")return m(a,R(u));
if(r.action==="DETAIL"){o=ae(u,r.recruitNo);
if(!o)throw f("진행 중인 파티 #"+r.recruitNo+"을 찾지 못했습니다.");
return m(a,le(o));
}if(r.action==="CREATE"){var l=r.explicitRecruitNumber||Number(u.body.nextPartyRecruitNumber||0);
if(!l)throw f("오늘 모집 번호 99개를 모두 사용했습니다. 관리자에게 번호 초기화를 요청해 주세요.");
if(ae(u,l)&&!te(n,i,t))throw f("이미 진행 중인 파티 #"+l+"이 있습니다.");
s=Ne(n,i,t,(function(){return{expectedRevision:0,command:{type:"CREATE_PARTY",aggregateId:e.newUuid(),payload:{recruitDate:d(),resetSequence:Number(u.body.nextPartyResetSequence||0),recruitNumber:l,partyType:r.type,title:r.title,maximumMembers:Number(r.maximumMembers),members:[],scheduledStartAt:null,protectedUntil:null}
}}
;
}));
if(!s||!s.ok)return m(a,p(s));
var c=s.body&&s.body.data?Number(s.body.data.recruitNumber||l):l;
return m(a,E(r,c));
}
if(r.action==="SYNC_FORM"){o=ae(u,r.recruitNo);
var v=oe(r);
var g=0;
var N=0;
for(N=0;
N<v.length;
N+=1)if(!v[N].substitute)g+=1;
if(g>Number(o?o.maximumMembers:r.maximumMembers))throw f("참가 인원이 모집 정원을 넘었습니다. 예비 인원은 정원과 별도로 최대 99명까지 보존됩니다.");
s=Ne(n,i,t,(function(){if(o)return{expectedRevision:Number(o.revision),command:{type:"SYNC_PARTY",aggregateId:o.id,payload:{members:v}}
};
return{expectedRevision:0,command:{type:"CREATE_PARTY",aggregateId:e.newUuid(),payload:{recruitDate:d(),resetSequence:Number(u.body.nextPartyResetSequence||0),recruitNumber:Number(r.recruitNo),partyType:r.type,title:r.title,maximumMembers:Number(r.maximumMembers),members:v,scheduledStartAt:se(d(),r.startTimeText),protectedUntil:null}
}}
;
}));
if(!s||!s.ok)return m(a,p(s));
u=ie(n,i);
o=ae(u,r.recruitNo);
return m(a,o?"[파티 #"+Number(r.recruitNo)+" 반영]\n"+Number(o.memberCount||0)+"/"+Number(o.maximumMembers||0)+" · 예비 "+Number(o.reserveCount||0)+"명\n마감: "+Number(r.recruitNo)+"ㅉ":"[K-LOL.GG 파티]\n명단을 반영했습니다.");
}
if(r.action==="FINISH"){o=ae(u,r.recruitNo);
if(!o&&!te(n,i,t))throw f("진행 중인 파티 #"+r.recruitNo+"을 찾지 못했습니다.");
s=Ne(n,i,t,(function(){return{expectedRevision:Number(o.revision),command:{type:"FINISH_PARTY",aggregateId:o.id,payload:{}}
};
}
));
return m(a,s&&s.ok?"[K-LOL.GG 파티 #"+r.recruitNo+"]\n모집을 마감했습니다.":p(s));
}return!1;
}
function Se(e){var r=e.mode==="ARAM"?"칼바람":e.mode==="AUGMENT_ARAM"?"증바람":"협곡";
var t=e.dateKey||d();
var n=Number(e.recruitNo||1);
var i=Number(e.capacity||10);
var a=["📢 내전하실분 #"+n," 》"+r," 》"+t+" "+String(e.time||"21:00")+" 시작","👥 0/"+i+"명","","*참가 신청 양식*"];
var u=0;
if(e.mode==="RIFT"){a.push("이름/현티어/최고티어/주라인/부라인");
a.push("EX) 1.지후/P/E/AD/MD");
}else{a.push("이름");
a.push("EX) 1.지후");
}
a.push("");
for(u=1;
u<=i;
u+=1)a.push(u+".");
return a.join("\n");
}function ye(){return["[K-LOL.GG 내전 종목 선택]","지원하지 않는 종목입니다: 양식","✅️협곡내전은 관리자에게 신청 후 안내에 따라 구인해주세요.✅️","","아래 명령어 중 하나를 입력해주세요.","- /내전구인 협곡","- /내전구인 칼바람","- /내전구인 증바람","","날짜·시간 지정: /내전구인 협곡 2026-08-06 21:00","모집번호·정원 지정: /내전구인 칼바람 #2 10명","","협곡은 티어·라인 양식으로 내전 명단에 등록됩니다.","칼바람·증바람은 이름만 모집하며 내전 명단에는 등록되지 않습니다."].join("\n");
}
function be(r,t,n,i){if(r.action==="JOIN")return m(i,we());
if(r.action==="CREATE"){if(r.templateRequest||r.invalidMode||!r.mode)return m(i,ye());
return m(i,Se(r));
}if(r.action==="STATUS"||r.action==="DETAIL")return m(i,G(e.seasonApplications({action:"STATUS",seasonId:g(),applyDate:d(),recruitNo:r.recruitNo===null?null:Number(r.recruitNo)}
,e.contextFromChat(t,n))));
return!1;
}function Te(){return["[K-LOL.GG 스크림 구인 양식]","","운영일: "+d(),"번호: #자동배정","","일시: ","방식: 3판2선","","우리팀: ","TOP: ","JUG: ","MID: ","ADC: ","SUP: ","","상대팀: ","TOP: ","JUG: ","MID: ","ADC: ","SUP: "].join("\n");
}
function Ae(r,t,n){var i=e.identityForChat(r,t);
return"KLOL_V41_V1_SCRIM_SYNC_"+i.roomId.substring(5)+"_"+i.senderId.substring(7)+"_"+w(o(n));
}function Le(r,t,n,i,a){var u=ie(n,i);
var o=null;
var s=null;
if(r.action==="STATUS"){if(!r.scrimNo)return m(a,de(u));
o=ue(u,r.scrimNo);
if(!o)throw f("진행 중인 스크림 #"+r.scrimNo+"을 찾지 못했습니다.");
return m(a,ge(o));
}
if(r.action==="UNSUPPORTED"){if(r.unsupportedKind==="JOIN")return m(a,"[K-LOL.GG 스크림 참가 명령 사용 안 함]\n스크림 양식에 직접 입력해주세요.");
if(r.unsupportedKind==="CONFIRM")return m(a,"[K-LOL.GG 스크림 확정 명령 사용 안 함]\n최신 스크림 양식을 다시 보내주세요.");
if(r.unsupportedKind==="CANCEL")return m(a,"[K-LOL.GG 스크림 취소 명령 사용 안 함]\n스크림은 오전 6시에 자동 종료됩니다.");
return m(a,"[K-LOL.GG 스크림 수동 종료 사용 안 함]\n스크림은 매일 오전 6시에 자동 종료됩니다.");
}if(r.action==="DETAIL"){o=ue(u,r.scrimNo);
if(!o)throw f("진행 중인 스크림 #"+r.scrimNo+"을 찾지 못했습니다.");
return m(a,ge(o));
}
if(r.action==="CREATE"&&r.templateRequest)return m(a,Te());
if(r.action==="CREATE"){var l=Ae(n,i,t);
if(String(DataBase.getDataBase(l)||"")==="done")return!0;
var c=Number(r.scrimNo||u.body.nextScrimNumber||0);
var v=r.operationDate||d();
if(!c)throw f("오늘 스크림 번호 99개를 모두 사용했습니다.");
if(!r.requesterTeamName)throw f("우리팀 항목에 팀 이름을 적어 주세요. 예: 우리팀: 별빛단");
o=ue(u,c);
var g=o&&o.tournamentId?String(o.tournamentId):null;
var N=r.tournamentNo?Number(r.tournamentNo):o&&o.legacyTournamentNumber?Number(o.legacyTournamentNumber):null;
s=Ne(n,i,t,(function(){return{expectedRevision:o?Number(o.revision):0,command:{type:o?"SYNC_SCRIM":"CREATE_SCRIM",aggregateId:o?String(o.id):e.newUuid(),payload:{recruitDate:v,scrimNumber:c,tournamentId:g,legacyTournamentNumber:N,requesterTeamId:null,title:r.requesterTeamName+" 스크림 구인",requesterTeamName:r.requesterTeamName,opponentTeamName:r.opponentTeamName||null,requesterLineup:r.requesterLineup||null,opponentLineup:r.opponentLineup||null,memo:r.memo||null,seriesRuleText:r.seriesRuleText||null,scheduledAt:se(v,r.startTimeText),bestOf:Number(r.gameCount||3)}}
};
}
));
if(!s||!s.ok)return m(a,p(s));
DataBase.setDataBase(l,"done");
u=ie(n,i);
o=ue(u,c);
if(s.body&&s.body.commandType==="CREATE_SCRIM")return m(a,"[K-LOL.GG 스크림 등록 완료]");
if(o)return m(a,"[스크림 #"+c+" 반영]\n상태: "+ce(o.status)+"\n\n"+ve(o).join("\n"));
return m(a,"[스크림 #"+c+" 반영]");
}return!1;
}
function Oe(r,t,n,i){var a=ee().classifyMessage(r,n,d());
if(!a)return!1;
if(a.domain==="INPUT"&&a.action==="REJECT")throw f("메시지가 너무 길거나 사용할 수 없는 제어문자가 포함되어 있습니다.");
if(a.domain==="PARTY")return he(a,r,t,n,i);
if(a.domain==="INHOUSE")return be(a,t,n,i);
if(a.domain==="SCRIM")return Le(a,r,t,n,i);
if(a.domain==="OPERATION_FORM"&&a.action==="SUBMIT"){var u=ne(t,n,r,(function(){return{};
}
));
var o=e.operationForm(a.formType,a.payload,e.contextFromChat(t,n,{requestKey:u.requestKey}));
return m(i,o&&o.ok?o.body&&typeof o.body.reply=="string"?String(o.body.reply):"[K-LOL.GG 운영 양식]\n"+a.formType+" 양식을 접수했습니다.":p(o));
}
if(a.domain==="MANAGED"){if(a.action==="PHOTO_CANCEL"){Ee(t,n);
return m(i,"[K-LOL.GG 사진 접수]\n이 대화의 사진 세션을 취소했습니다.");
}if(a.action==="REGISTRATION_HUB")return m(i,Pe());
if(a.action==="INHOUSE_RESULT")return m(i,"[K-LOL.GG 내전 결과 등록]\n로그인한 계정으로 결과와 사진을 제출해 주세요.\n"+c("/matches/submit"));
if(a.action==="INHOUSE_RESULT_STATUS")return m(i,"[K-LOL.GG 내전 결과 제출 현황]\n로그인한 본인의 제출 상태만 확인할 수 있습니다.\n"+c("/matches/submissions"));
if(a.action==="DISCIPLINE_CREATE")return m(i,"[K-LOL.GG 관리자 경고 등록]\n관리자 로그인과 2차 인증 후 등록해 주세요.\n"+c("/admin/discipline/new"));
if(a.action==="DISCIPLINE_EVIDENCE")return m(i,"[K-LOL.GG 경고 차감 사진 제출]\n로그인하면 본인의 진행 과제만 표시됩니다.\n"+c("/account/discipline"));
if(a.action==="DISCIPLINE_STATUS")return m(i,"[K-LOL.GG 내 경고 현황]\n내정보에서 경고 상태와 남은 사진 수를 확인해 주세요.\n"+c("/account/discipline"));
}
return!1;
}function Re(r,t){var n=e.identityForChat(r,t);
return"KLOL_V41_IMAGE_SESSION_"+n.roomId.substring(5)+"_"+n.senderId.substring(7);
}
function Ie(e,r,t){if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t))throw new Error("사진 세션 ID를 확인해 주세요.");
DataBase.setDataBase(Re(e,r),t+"|"+String((new Date).getTime()));
}function Ee(e,r){try{DataBase.setDataBase(Re(e,r),"");
}
catch(e){}}
function Ce(e,r){var t=String(DataBase.getDataBase(Re(e,r))||"").split("|");
var n=a(t[0]);
var u=Number(t[1]||0);
var o=(new Date).getTime()-u;
if(!u||o<0||o>i||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(n)){Ee(e,r);
return null;
}return{sessionId:n,savedAt:u,remainingMs:i-o}
;
}function De(e,r){var t=Ce(e,r);
return t?t.sessionId:"";
}
function Ge(e){var r="";
try{if(e&&e.getImageBase64)r=String(e.getImageBase64()||"");
}catch(e){}
try{if(!r&&e&&e.getImage)r=String(e.getImage()||"");
}catch(e){}
try{if(!r&&e&&e.getImageBitmap){var t=e.getImageBitmap();
if(t){var n=new java.io.ByteArrayOutputStream;
t.compress(android.graphics.Bitmap.CompressFormat.JPEG,92,n);
r=String(android.util.Base64.encodeToString(n.toByteArray(),android.util.Base64.NO_WRAP)||"");
n.close();
}}
}catch(e){r="";
}
return r;
}function _e(e){var r=a(o(e));
return r==="사진"||r==="[사진]"||r==="Photo"||r==="photo";
}
function Me(e){if(!e||!e.ok)return p(e);
var r=e.body&&typeof e.body=="object"?e.body:{};
var t=Number(r.receivedImageCount||0);
var n=Number(r.expectedImageCount||0);
var i=["[K-LOL.GG 사진 접수]","사진을 안전하게 접수했습니다."];
if(n>0)i.push("진행: "+t+"/"+n);
if(r.completed===!0)i.push("필요한 사진 접수가 완료되었습니다.");
else if(n>t)i.push("남은 사진: "+(n-t)+"장");
return i.join("\n");
}
function xe(r,t,n,i){var a=De(r,t);
if(!a)return!1;
var u="image/jpeg";
var o=String(n).match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/i);
var s=o?o[2]:String(n);
if(o)u=o[1].toLowerCase();
s=s.replace(/\s+/g,"");
var l=e.imageReceive({sessionId:a,base64Image:s,declaredContentType:u,declaredSha256Hex:e.sha256Base64BytesHex(s),originalFileName:null},e.contextFromChat(r,t,{timeoutMs:9e4}
));
if(l&&l.body&&(l.body.completed===!0||l.body.sessionActive===!1)||l&&(l.status===404||l.status===410))Ee(r,t);
m(i,Me(l));
return!0;
}function Pe(){return["[K-LOL.GG 쉬운 등록 센터]","처음 사용하셔도 괜찮아요. 필요한 항목의 링크를 누르면 됩니다.","▶ "+c("/start"),"","① 내전 결과 등록","경기 정보와 결과 사진 2~3장을 한 화면에서 제출합니다.","▶ "+c("/matches/submit"),"","② 주의·경고·벤 등록 (관리자)","대상 검색부터 사유·근거 사진 등록까지 한 화면에서 처리합니다.","▶ "+c("/admin/discipline/new"),"※ 관리자 로그인이 필요하며, 권한이 없으면 등록할 수 없습니다.","","③ 경고 차감 사진 제출","본인의 진행 과제를 선택하고 남은 사진을 한 번에 제출합니다.","▶ "+c("/discipline/evidence"),"※ 본인 계정 로그인이 필요합니다.","","등록과 사진 제출은 로그인한 본인 계정 기준으로 처리됩니다."].join("\n");
}
function Ue(){return["[K-LOL.GG 구인도우미]","","현재 사용 중인 카카오톡 명령어 전체 설명은 아래 페이지에서 확인해주세요.","",c("/recruit-helper"),"","구인현황 바로가기:",c("/recruit")].join("\n");
}function Ke(){return["[K-LOL.GG 구인 도움말]","","1. 파티","생성: 5인파티","현황: 구인현황","종료: 번호ㅉ","","2. 내전","생성: 내전구인","현황: 내전현황","매일 오전 6시 자동 종료","","3. 스크림","생성: 스크림구인","현황: 스크림현황","매일 오전 6시 자동 종료","","공통: 양식 복사 → 이름 추가·삭제 → 양식 전체 전송"].join("\n");
}
function we(){return["[K-LOL.GG 내전 참가 방법 안내]","오늘 시즌내전에 참가 가능하신 분은 사이트에서 참가 신청 부탁드립니다.","","1. K-LOL.GG 접속",c(""),"2. 로그인","3. 시즌내전 참가하기 클릭","4. 주 포지션 / 부 포지션 선택","5. 참가 신청 완료","","참가 신청 기준으로 팀 밸런스가 진행됩니다.","신청하지 않은 인원은 팀 편성에서 누락될 수 있습니다."].join("\n");
}function Fe(e){var r=a(e).replace(/\s+/g,"");
if(/^\/?(?:구인도우미|구인웹도우미|구인매뉴얼|명령어페이지)$/.test(r))return Ue();
if(/^\/?(?:구인구직도움말|구인도움말|구인명령어)$/.test(r))return Ke();
if(/^\/?(?:등록|등록도움말|사진취소)$/.test(r))return Pe();
if(/^\/?(?:내전참가|참가신청)$/.test(r))return we();
if(/^\/?(?:내전등록|결과등록|내전결과)$/.test(r))return["[K-LOL.GG 내전 결과 등록]","가장 쉬운 등록 방법을 안내합니다.","","1. 아래 링크를 엽니다.","2. 세트 수·회차·팀 밸런스를 확인합니다.","3. 결과 사진 2~3장을 한 번에 올리고 제출합니다.","","▶ "+c("/matches/submit"),"","로그인하면 진행 중인 제출을 자동으로 찾아 이어서 할 수 있습니다."].join("\n");
if(/^\/?(?:내전등록현황|결과현황)$/.test(r))return["[K-LOL.GG 내전 결과 제출 현황]","사이트에 로그인하면 진행 중인 내 제출을 자동으로 확인할 수 있습니다.","","▶ "+c("/matches/submit")].join("\n");
if(/^\/?(?:경고등록|경고)$/.test(r))return["[K-LOL.GG 관리자 경고 등록]","관리자 화면에서 대상 검색 → 종류 선택 → 사유·사진 등록 순서로 진행합니다.","","▶ "+c("/admin/discipline/new"),"","※ 관리자 로그인과 2차 인증이 필요하며, 완료 후 이 화면으로 돌아옵니다."].join("\n");
if(/^\/?(?:인증|경고인증)$/.test(r))return["[K-LOL.GG 경고 차감 사진 제출]","사이트에 로그인하면 본인의 진행 과제만 자동으로 표시됩니다.","로그인 계정 기준으로 남은 사진을 한 번에 제출할 수 있습니다.","","▶ "+c("/discipline/evidence")].join("\n");
if(/^\/?경고현황$/.test(r))return["[K-LOL.GG 내 경고 현황]","내정보에서 경고 상태와 남은 사진 수를 확인하세요.","","▶ "+c("/account#discipline")].join("\n");
return"";
}
function $e(){return["[K-LOL.GG 일반 도움말]","","LOL-K 기능","- 내전현황 : 현재 시즌내전 신청 현황","- 내전참가 / 참가신청 : 참가 방법 안내","- 전적 닉네임#태그 : 플레이어 전적 조회","- 최근 닉네임#태그 : 최근 경기 조회","- 랭킹 : 랭킹 조회","","운영 기능","- /등록 : 초보자용 등록 센터","- /내전등록 : 사이트에서 내전 결과·사진 한 번에 등록","- /경고등록 : 관리자 경고 등록 화면 열기","- /인증 : 로그인 후 내 경고 사진을 사이트에서 제출","- /경고현황 : 내정보의 경고 진행 상황 열기","- /결과현황 : 사이트의 내 미완료 결과 접수 열기","","구인구직 명령어는 구인도움말을 입력해주세요.","스크림구인은 /스크림구인, /스크림현황을 사용해주세요.","","참고","- 모든 명령어 앞에 /를 붙여도 사용할 수 있습니다.","- 예) /내전현황, /전적 닉네임#태그, /구인도움말"].join("\n");
}function ke(){return["[K-LOL.GG V2 관리 도움말]","/V2연동확인 · /V2사진세션 <사이트 발급 UUID>","/사진상태 · /V2사진취소","/V2모집 · /V2시즌 · /V2양식"].join("\n");
}
function response(r,n,i,u,l,c,f){var N=a(o(n));
var h="";
try{if(s(i))return null;
h=Ge(c);
if(h&&xe(r,i,h,l))return null;
if(_e(N)&&Ce(r,i))return m(l,"[K-LOL.GG 사진 접수]\n사진 원본을 읽지 못했습니다. 카카오톡의 사진을 파일이 아닌 일반 사진으로 다시 보내 주세요. 세션은 그대로 유지됩니다.");
if(N.indexOf("들어왔습니다")>=0)return m(l,"다시 오셨네요, 반가워요! 😊");
if(N.indexOf("나갔습니다")>=0||N.indexOf("초대되었습니다")>=0)return null;
if(!N)return null;
if(N==="/봇버전"||N==="봇버전")return m(l,"[K-LOL.GG 카카오봇]\n"+t);
if(N==="/V2도움말"||N==="V2도움말")return m(l,ke());
if(N==="/도움말"||N==="도움말"||N==="/명령어"||N==="명령어")return m(l,$e());
var T=Fe(N);
if(T)return m(l,T);
if(/^\/?(?:V2)?연동확인$/i.test(N))try{var A=e.identityForChat(r,i);
return m(l,"[K-LOL.GG V2 연동 ID]\n방: "+A.roomId+"\n발신자: "+A.senderId);
}catch(e){return m(l,"[K-LOL.GG V2 연동]\n연동 ID 생성에 실패했습니다. MessengerBot R 실행 로그를 확인해 주세요.");
}
if(/^\/?사진상태$/.test(N)){var L=Ce(r,i);
if(!L)return m(l,"[K-LOL.GG 사진 접수]\n연결된 사진 세션이 없습니다. 사이트에서 세션을 발급한 뒤 /V2사진세션 UUID를 보내 주세요.");
return m(l,"[K-LOL.GG 사진 접수]\n사진 세션이 연결되어 있습니다. 약 "+Math.max(1,Math.ceil(L.remainingMs/6e4))+"분 남았습니다.\n취소: /사진취소");
}if(/^\/?(?:사진취소|V2사진취소)$/.test(N)){Ee(r,i);
return m(l,"[K-LOL.GG 사진 접수]\n이 대화의 사진 세션을 취소했습니다.");
}
if(/^\/?내전미리보기취소$/.test(N)){$(r,i);
return m(l,"[K-LOL.GG 내전 신청]\n저장된 미리보기를 취소했습니다. 사이트에는 반영하지 않았습니다.");
}var O=N.match(/^\/?내전확인\s+([A-Za-z0-9]{4,16})$/);
if(O)return V(r,i,O[1],l);
if(/^\/?전적\s+/.test(N))return m(l,S(e.playerRecord(N.replace(/^\/?전적\s+/,""),e.contextFromChat(r,i))));
if(/^\/?최근\s+/.test(N))return m(l,S(e.recentMatches(N.replace(/^\/?최근\s+/,""),e.contextFromChat(r,i))));
if(/^\/?랭킹$/.test(N))return m(l,y(e.ranking(e.contextFromChat(r,i))));
if(J(N))return Y(N,r,i,l);
if(/K-LOL\.GG\s*내전\s*참가\s*신청|내전\s*(?:참가\s*)?신청|협곡\s*내전|참가\s*신청\s*양식/.test(N)&&/^\s*\d{1,2}\s*[.)]/m.test(N))return m(l,B(r,i,N));
if(Oe(N,r,i,l))return null;
var R=N.match(/^\/?(?:자동공지|공지생성)(?:\s+(12|15|18|20))?$/i);
if(R)return m(l,b(e.scheduledNotice(R[1]||null,e.contextFromChat(r,i))));
if(/^\/?(?:구인현황|스크림현황)$/.test(N))return m(l,I(e.openchatStatus(e.contextFromChat(r,i))));
if(/^\/?내전현황(?:\s*#?\d{1,3})?$/.test(N))return m(l,G(e.seasonApplications({action:"STATUS",seasonId:g(),applyDate:d(),recruitNo:v(N)}
,e.contextFromChat(r,i))));
if(N.indexOf("/V2모집 ")===0)return Q(N,r,i,l);
if(N.indexOf("/V2시즌 ")===0)return m(l,G(e.seasonApplications(q(N,"/V2시즌"),e.contextFromChat(r,i))));
if(N.indexOf("/V2양식 ")===0){var E=q(N,"/V2양식");
return m(l,p(e.operationForm(E.formType,E.payload,e.contextFromChat(r,i))));
}if(N.indexOf("/V2사진세션 ")===0){Ie(r,i,a(N.substring(7)));
return m(l,"[K-LOL.GG 사진 접수]\n30분 동안 이 대화의 다음 사진을 안전하게 접수합니다.");
}
}catch(e){var C=e&&e.v41UserSafe===!0?String(e.message||"입력 형식을 확인해 주세요."):"설정 또는 입력 형식을 확인해 주세요.";
m(l,C.indexOf("[K-LOL.GG 요청 실패]")===0?C:"[K-LOL.GG 요청 실패]\n"+C);
}
}response.__kakaoBotEntryPoint=!0;
