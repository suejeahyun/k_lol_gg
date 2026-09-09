var e=function(){var e="KLOL_KAKAO_WEBHOOK_V1";
var r="KLOL_V2_BASE_URL";
var t="KLOL_V2_KAKAO_WEBHOOK_SECRET_CURRENT";
var n="KLOL_V2_KAKAO_IDENTITY_SECRET";
var a={recruit:"/api/integrations/kakao/recruits",playerSearch:"/api/integrations/kakao/search-player",openchat:"/api/integrations/kakao/openchat",seasonApplications:"/api/integrations/kakao/season-applications",managedForms:"/api/integrations/kakao/managed-forms",operationForms:"/api/integrations/kakao/operation-forms",imageReceive:"/api/integrations/kakao/image-receive",scheduledNotice:"/api/integrations/kakao/scheduled-notice"}
;
function i(e){return String(e==null?"":e).replace(/^\s+|\s+$/g,"");
}function u(e){try{return i(String(DataBase.getDataBase(e)||""));
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
function f(e){var r=i(e).replace(/\/+$/,"");
if(!r)throw new Error("V2 HTTPS 주소가 없습니다. 봇의 KLOL_V2_BASE_URL 비공개 설정을 확인해 주세요.");
if(!/^https:\/\/[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?(?::443)?$/.test(r))throw new Error("V2 HTTPS 주소 설정을 확인해 주세요.");
return r;
}function p(){return f(u(r));
}
function d(e,r){var t=i(e);
if(!/^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/.test(t))throw new Error(r+" 식별자 설정을 확인해 주세요.");
return t;
}function v(){var e=u(t);
if(o(e).length<32)throw new Error("V2 서명 키가 없거나 너무 짧습니다. 봇의 비공개 설정을 확인해 주세요.");
return e;
}
function g(){var e=u(n);
if(o(e).length<32)throw new Error("V2 익명 식별 키가 없거나 너무 짧습니다. 봇의 비공개 설정을 확인해 주세요.");
return e;
}function h(){return String(java.util.UUID.randomUUID().toString()).replace(/-/g,"");
}
function N(){return String(java.util.UUID.randomUUID().toString());
}function S(e){return"mbr-v41-"+e;
}
function T(r,t,n,a,i){return[e,r,t,n,a,i].join("\n");
}function y(e){try{return JSON.parse(String(e||""));
}
catch(e){return null;
}}
function b(e,r,t){if(!t||typeof t!="object")throw new Error("V2 요청 컨텍스트가 필요합니다.");
if(!Object.prototype.hasOwnProperty.call(a,t.endpointName)||a[t.endpointName]!==e)throw new Error("허용되지 않은 V2 API 경로입니다.");
var n=JSON.stringify(r);
var u=d(t.roomId,"방");
var o=d(t.senderId,"발신자");
var s=h();
var c=Math.floor((new Date).getTime()/1e3);
var f=l(n);
var g="v1="+m(v(),T(c,s,u,o,f));
var N=org.jsoup.Jsoup.connect(p()+e).ignoreContentType(!0).ignoreHttpErrors(!0).method(org.jsoup.Connection.Method.POST).header("Content-Type","application/json; charset=utf-8").header("Accept","application/json").header("x-klol-timestamp",String(c)).header("x-klol-nonce",s).header("x-klol-room",u).header("x-klol-sender",o).header("x-klol-bot-self",t.botSelf===!0?"1":"0").header("x-klol-signature",g).header("Idempotency-Key",t.requestKey||S(s)).timeout(typeof t.timeoutMs=="number"?Math.floor(t.timeoutMs):12e3).requestBody(n);
if(e===a.imageReceive)N.maxBodySize(0);
if(typeof t.expectedRevision=="number"&&t.expectedRevision>=0)N.header("If-Match",'"'+String(Math.floor(t.expectedRevision))+'"');
var response=N.execute();
var b=y(response.body());
return{ok:response.statusCode()>=200&&response.statusCode()<300,status:response.statusCode(),body:b,traceId:i(response.header("X-Trace-Id"))};
}
function A(e,r){var t={};
var n="";
r=r||{}
;
for(n in r)if(Object.prototype.hasOwnProperty.call(r,n))t[n]=r[n];
t.endpointName=e;
return t;
}function L(e,r){var t=g();
return{roomId:"room-"+m(t,"room-id\n"+i(e)).substring(0,32),senderId:"sender-"+m(t,"sender-id\n"+i(r)).substring(0,32)}
;
}function O(e,r,t){var n=L(e,r);
var a={roomId:n.roomId,senderId:n.senderId,botSelf:!1}
;
var i="";
t=t||{};
for(i in t)if(Object.prototype.hasOwnProperty.call(t,i))a[i]=t[i];
return a;
}
function I(e,r){if(!r||typeof r.expectedRevision!="number")throw new Error("모집 요청에는 최신 revision이 필요합니다.");
return b(a.recruit,e,A("recruit",r));
}function R(e,r){return b(a.playerSearch,{query:String(e||"")}
,A("playerSearch",r));
}function E(e){return b(a.openchat,{command:"STATUS"}
,A("openchat",e));
}function C(e,r){return b(a.openchat,{command:"SEARCH_PLAYER",query:String(e||"")}
,A("openchat",r));
}function D(e,r){return b(a.openchat,{command:"RECORD",query:String(e||"")}
,A("openchat",r));
}function G(e,r){return b(a.openchat,{command:"RECENT",query:String(e||"")}
,A("openchat",r));
}function x(e){return b(a.openchat,{command:"RANKING"}
,A("openchat",e));
}function _(e,r){return b(a.seasonApplications,e,A("seasonApplications",r));
}
function M(e,r,t){return b(a.managedForms,{command:"SUBMIT_OPERATION_FORM",formType:e,payload:r},A("managedForms",t));
}
function P(e,r,t){return b(a.operationForms,{formType:e,payload:r},A("operationForms",t));
}
function U(e,r){return b(a.imageReceive,e,A("imageReceive",r));
}function K(e,r){return b(a.scheduledNotice,e==null?{}
:{slot:e},A("scheduledNotice",r));
}
function w(e){if(e&&e.ok)return"[K-LOL.GG]\n요청을 안전하게 처리했습니다.";
var r=e&&e.body&&typeof e.body=="object"?e.body:null;
var t=r&&typeof r.detail=="string"?r.detail:"잠시 후 다시 시도해 주세요.";
var n=e&&e.traceId?"\n문의 코드: "+e.traceId:"";
return"[K-LOL.GG 요청 실패]\n"+t+n;
}return{version:"KLOL_KAKAO_BOT_V41_V2_TRANSPORT_2026_09_09_REQUIRED_ORIGIN",contractVersion:e,publicBaseUrl:p,identityForChat:L,contextFromChat:O,sha256Base64BytesHex:c,newUuid:N,recruit:I,searchPlayer:R,openchatStatus:E,openchatSearch:C,playerRecord:D,recentMatches:G,ranking:x,seasonApplications:_,managedForm:M,operationForm:P,imageReceive:U,scheduledNotice:K,userMessage:w}
;
}();
var r=function(){var e=12e3;
var r=320;
var t=120;
var n=["TOP","JGL","MID","ADC","SUP"];
var a={TOP:"TOP","탑":"TOP",JUG:"JGL",JGL:"JGL",JG:"JGL",JUNGLE:"JGL","정글":"JGL",MID:"MID",MIDDLE:"MID","미드":"MID",ADC:"ADC",AD:"ADC",BOT:"ADC",BOTTOM:"ADC","원딜":"ADC","바텀":"ADC",SUP:"SUP",SPT:"SUP",SUPPORT:"SUP","서폿":"SUP","서포터":"SUP"}
;
function i(e){return String(e==null?"":e).replace(/^\s+|\s+$/g,"");
}function u(e){var r=String(e==null?"":e);
var t="";
var n=0;
var a=0;
for(n=0;
n<r.length;
n+=1){a=r.charCodeAt(n);
if(a>=65281&&a<=65374)t+=String.fromCharCode(a-65248);
else if(a===160||a===12288)t+=" ";
else t+=r.charAt(n);
}
return t.replace(/\r\n?/g,"\n").replace(/[–—]/g,"-").replace(/\n{4,}/g,"\n\n\n");
}function o(e){var r=s(e);
var t=r.ok?i(r.text):"";
if(t.length>1&&t.charAt(0)==="/"&&t.charAt(1)!=="/"&&!/\s/.test(t.charAt(1)))return t.substring(1);
return t;
}
function s(t){var n=String(t==null?"":t);
var a="";
if(n.length>e)return{ok:!1,error:"INPUT_TOO_LONG",text:""};
if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(n))return{ok:!1,error:"CONTROL_CHARACTER",text:""}
;
if(n.replace(/\r\n?/g,"\n").split("\n").length>r)return{ok:!1,error:"TOO_MANY_LINES",text:""};
a=u(n);
return{ok:!0,error:null,text:a}
;
}function l(e,r){var t=s(e);
var n=t.ok?i(t.text).replace(/\s+/g," "):"";
return n&&n.length<=r?n:"";
}
function c(e,r,t){return typeof e=="number"&&isFinite(e)&&Math.floor(e)===e&&e>=r&&e<=t;
}function m(e,r){var t=e?Number(e):null;
return t!==null&&c(t,1,r)?t:null;
}
function f(e){var r={"자랭구인":["FLEX_RANK","자랭 하실분!",5],"일반구인":["NORMAL_GAME","일반 하실분!",5],"솔랭구인":["SOLO_RANK","솔랭 하실분!",2],"칼바람구인":["ARAM","칼바람 하실분!",5],"증바람구인":["ARAM","증바람 하실분!",5],"기타게임구인":["OTHER_GAME","기타게임 하실분!",8],"롤체일반구인":["TFT_NORMAL","롤체 일반 하실분!",8],"롤체랭크구인":["TFT_RANK","롤체 랭크 하실분!",3],"더블업구인":["DOUBLE_UP","더블업 하실분!",2],"5인협곡":["PARTY_RIFT","5인 협곡 파티 구인",5],"5인협곡파티":["PARTY_RIFT","5인 협곡 파티 구인",5]};
return r[e]||null;
}
function p(e){var r=s(e);
var t=r.ok?i(r.text):"";
var n=null;
var a=0;
var u=null;
var o=null;
var l="";
if(!t||t.indexOf("\n")>=0)return null;
n=t.match(/^\/?(\d{1,2})\s*인\s*(협곡\s*)?(?:파티|구인)(?:\s+(\d{1,2}))?\s*$/);
if(n){a=Number(n[1]);
u=m(n[3],99);
if(!c(a,1,99)||n[3]&&u===null)return null;
if(n[2]&&a!==5)return null;
return{domain:"PARTY",action:"CREATE",type:n[2]?"PARTY_RIFT":"PARTY_NUMBER",title:n[2]?"5인 협곡 파티 구인":String(a)+"인 파티 구인",maximumMembers:a,explicitRecruitNumber:u};
}
n=t.match(/^\/?(자랭구인|일반구인|솔랭구인|칼바람구인|증바람구인|기타게임구인|롤체일반구인|롤체랭크구인|더블업구인|5\s*인\s*협곡(?:\s*파티)?)(?:\s+(\d{1,2}))?\s*$/);
if(!n)return null;
l=n[1].replace(/\s+/g,"");
o=f(l);
u=m(n[2],99);
if(!o||n[2]&&u===null)return null;
return{domain:"PARTY",action:"CREATE",type:o[0],title:o[1],maximumMembers:o[2],explicitRecruitNumber:u};
}
function d(e){var r=s(e);
var t=r.ok?i(r.text):"";
var n=t.replace(/\s+/g,"");
var a=null;
if(!t||t.indexOf("\n")>=0)return null;
a=t.match(/^\/?#?\s*(\d{1,2})\s*(?:쫑|ㅉ)\s*$/);
if(!a)a=n.match(/^\/?#?(\d{1,2})(?:번|인)?(?:파티|구인)?(?:쫑|ㅉ|마감|종료)$/);
if(!a)a=t.match(/^\/?구인(?:마감|쫑|종료)\s*#?\s*(\d{1,2})\s*$/);
if(!a||!c(Number(a[1]),1,99))return null;
return{domain:"PARTY",action:"FINISH",recruitNo:Number(a[1])};
}
function v(e){var r=e.match(/모집\s*번호\s*:?\s*#?\s*(\d{1,2})/i);
if(!r)r=e.match(/(^|\s)#\s*(\d{1,2})(?=\s|[·]|$)/);
var t=r?r[r.length-1]:null;
return m(t,99);
}function g(e){var r=i(e).replace(/^[.:)\]\-\s]+/,"").replace(/\s+/g," ");
if(!r||r.length>100)return"";
if(/^(?:미정|없음|공란|-|모집중|\d+\s*명)$/.test(r))return"";
return r;
}
function h(e){var r=i(e).toUpperCase();
return a[r]||a[i(e)]||null;
}function N(e){var r=e.split("\n");
var t={startTimeText:null,gameInfo:null,tierText:null,preferredLineText:null,playStyle:null}
;
var n=0;
var a="";
var u="";
for(n=0;
n<r.length;
n+=1){a=i(r[n]).replace(/^[》>]\s*/,"");
if(/^(?:게임\s*)?(?:시작|출발)\s*시간\s*[:：]/.test(a)){u=i(a.replace(/^(?:게임\s*)?(?:시작|출발)\s*시간\s*[:：]/,""));
var o=u.match(/^(.*?)(?:\+\s*티어\s*[:：]?\s*)([^+]+)$/);
if(o){if(i(o[1]).length<=160)t.startTimeText=i(o[1])||null;
if(i(o[2]).length<=80)t.tierText=i(o[2])||null;
}else if(u&&u.length<=160)t.startTimeText=u;
}
else if(/^게임\s*정보\s*[:：]/.test(a)){u=i(a.replace(/^게임\s*정보\s*[:：]/,""));
if(u&&u.length<=500)t.gameInfo=u;
}else if(/^(?:티어|현티어)\s*:/.test(a)){u=i(a.replace(/^(?:티어|현티어)\s*:/,""));
if(u&&u.length<=80)t.tierText=u;
}
else if(/^(?:듀오\s*)?선호(?:하는)?\s*라인\s*:/.test(a)){u=i(a.replace(/^(?:듀오\s*)?선호(?:하는)?\s*라인\s*:/,""));
if(u&&u.length<=80)t.preferredLineText=u;
}if(/즐겜/.test(a)&&!/빡겜/.test(a))t.playStyle="즐겜";
if(/빡겜/.test(a)&&!/즐겜/.test(a))t.playStyle="빡겜";
}
return t;
}function S(e,r,t){var n=[[/롤체\s*일반/,"TFT_NORMAL","롤체 일반 하실분!",8],[/롤체\s*랭크/,"TFT_RANK","롤체 랭크 하실분!",3],[/더블업/,"DOUBLE_UP","더블업 하실분!",2],[/솔랭/,"SOLO_RANK","솔랭 하실분!",2],[/자랭/,"FLEX_RANK","자랭 하실분!",5],[/일반/,"NORMAL_GAME","일반 하실분!",5],[/(?:칼바람|증바람)/,"ARAM",/증바람/.test(e)?"증바람 하실분!":"칼바람 하실분!",5],[/기타게임/,"OTHER_GAME","기타게임 하실분!",8],[/협곡/,"PARTY_RIFT","5인 협곡 파티 구인",5]];
var a=l(r,32);
var i=Number(t);
var u="파티 구인";
var o=0;
var s=null;
for(o=0;
o<n.length;
o+=1)if(n[o][0].test(e)){if(!a)a=n[o][1];
u=n[o][2];
if(!c(i,1,99))i=n[o][3];
break;
}
s=e.match(/(\d{1,2})\s*인\s*(?:파티\s*)?구인/);
if(s&&!a){a="PARTY_NUMBER";
i=Number(s[1]);
u=String(i)+"인 파티 구인";
}if(!a&&/(^|\n)\s*(?:TOP|JUG|JGL|JG|MID|ADC|AD|SUP|탑|정글|미드|원딜|서폿)\s*[.:]/i.test(e))a="PARTY_RIFT";
if(!c(i,1,99))i=a==="PARTY_RIFT"||a==="FLEX_RANK"||a==="NORMAL_GAME"?5:99;
return{type:a||"PARTY_NUMBER",title:u,maximumMembers:i}
;
}function T(e,r,a){var u=s(e);
var o=u.ok?u.text:"";
var l=o?v(o):null;
var m=null;
var f=null;
var p=[];
var d=[];
var T={}
;
var y=0;
var b="";
var A=null;
var L=null;
var O="";
var I=0;
var R=!1;
var E=[];
var C=0;
if(!o||l===null)return null;
m=S(o,r,a);
f=N(o);
p=o.split("\n");
for(y=0;
y<p.length;
y+=1){b=i(p[y]);
if(!b)continue;
A=b.match(/^(TOP|JUG|JGL|JG|JUNGLE|MID|ADC|AD|BOT|SUP|SPT|SUPPORT|탑|정글|미드|원딜|바텀|서폿|서포터)\s*[.:]\s*(.*)$/i);
if(A){L=h(A[1]);
O=g(A[2]);
if(!L||!O)continue;
if(T["position:"+L])return null;
T["position:"+L]=!0;
d.push({name:O,position:L,slotNo:null,substitute:!1});
continue;
}
A=b.match(/^(?:예비|후보|대기)\s*(\d{1,2})?\s*[.):]?\s*(.*)$/);
if(A){I=A[1]?Number(A[1]):1;
E=String(A[2]||"").split(/[,/]+/);
if(!c(I,1,99))continue;
for(C=0;
C<E.length;
C+=1){O=g(E[C].replace(/^\d{1,2}\s*[.)]\s*/,""));
if(!O)continue;
if(!c(I+C,1,99)||T["substitute:"+(I+C)])return null;
T["substitute:"+(I+C)]=!0;
d.push({name:O,position:null,slotNo:I+C,substitute:!0});
}
continue;
}A=b.match(/^(\d{1,2})(?:[.)]|\s+)\s*(.*)$/);
if(!A)continue;
I=Number(A[1]);
O=g(A[2]);
R=!1;
if(!O||!c(I,1,m.maximumMembers))continue;
if(T["slot:"+I])return null;
T["slot:"+I]=!0;
d.push({name:O,position:null,slotNo:I,substitute:R}
);
if(d.length>t)return null;
}if(d.length<1)return null;
d.sort((function(e,r){var t=e.position?n.indexOf(e.position):100;
var a=r.position?n.indexOf(r.position):100;
if(t!==a)return t-a;
if(e.substitute!==r.substitute)return e.substitute?1:-1;
return Number(e.slotNo||0)-Number(r.slotNo||0);
}
));
return{domain:"PARTY",action:"SYNC_FORM",recruitNo:l,type:m.type,title:m.title,maximumMembers:m.maximumMembers,startTimeText:f.startTimeText,tierText:f.tierText,gameInfo:f.gameInfo,preferredLineText:f.preferredLineText,playStyle:f.playStyle,members:d};
}
function y(e){var r=s(e);
var t=r.ok?i(r.text):"";
if(!t||v(t)!==null)return!1;
if(/내전\s*(?:참가\s*)?신청|신청일\s*[:：]|회차\s*[:：]|Riot\s*ID\s*[:：]|주라인\s*[:：]/i.test(t))return!1;
if(/(^|\n)\s*(?:TOP|JUG|JGL|JG|MID|ADC|AD|SUP|탑|정글|미드|원딜|서폿|서포터)\s*[.:：]/i.test(t))return!0;
if(/(?:자랭|일반|솔랭|칼바람|증바람|기타게임|롤체\s*(?:일반|랭크)|더블업)\s*하실분/.test(t))return!0;
if(/\d{1,2}\s*인\s*(?:협곡\s*)?(?:파티\s*)?구인/.test(t))return!0;
return!1;
}function b(e){var r=s(e);
var t=r.ok?i(r.text):"";
var n=t.replace(/\s+/g,"");
var a=null;
var u=p(t)||d(t);
if(!t)return null;
if(u)return u;
if(/^\/?(?:구인구직도움말|구인도움말|구인명령어|구인도우미|구인웹도우미|구인매뉴얼|명령어페이지)$/.test(n))return{domain:"PARTY",action:"HELP"}
;
a=t.match(/^\/?(?:구인상세|상세)\s*#?\s*(\d{1,2})$/);
if(a&&c(Number(a[1]),1,99))return{domain:"PARTY",action:"DETAIL",recruitNo:Number(a[1])};
if(/^\/?(?:현재구인구직현황|현재구인현황|구인구직현황|구인현황|현황)$/.test(n))return{domain:"PARTY",action:"STATUS"}
;
if(y(t))return{domain:"PARTY",action:"MISSING_NUMBER"};
u=T(t);
return u;
}
function A(e){return e<10?"0"+e:String(e);
}function L(e,r,t){var n=new Date(e,r-1,t);
if(n.getFullYear()!==e||n.getMonth()!==r-1||n.getDate()!==t)return null;
return String(e)+"-"+A(r)+"-"+A(t);
}
function O(e){var r=e.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
return r?L(Number(r[1]),Number(r[2]),Number(r[3])):null;
}function I(e,r){var t=e.match(/(?:^|\s)([01]?\d|2[0-3])\s*:\s*([0-5]\d)(?:\s|$)/);
if(!t)t=e.match(/(?:^|\s)([01]?\d|2[0-3])\s*시(?:\s*([0-5]?\d)\s*분?)?(?:\s|$)/);
return t?A(Number(t[1]))+":"+A(Number(t[2]||0)):r;
}
function R(e){var r=i(e).replace(/\s+/g,"").toLowerCase();
if(/^(?:협곡|소환사의협곡|rift)$/.test(r))return"RIFT";
if(/^(?:칼바람|칼바람아수라장|aram)$/.test(r))return"ARAM";
if(/^(?:증바람|증바|증강칼바람|augmentaram)$/.test(r))return"AUGMENT_ARAM";
return null;
}function E(e,r){var t=s(e);
var n=t.ok?i(t.text).replace(/^\//,""):"";
var a=null;
var u="";
n.replace(/\s+/g,"");
var o="";
var c=null;
var f=null;
var p=null;
var d=10;
if(!n||n.indexOf("\n")>=0)return null;
a=n.match(/^(?:내전구인구직|내전구인|내전모집)(?:\s+(.*))?$/i);
if(a){u=i(a[1]||"");
o=u.split(/\s+/)[0]||"";
c=R(o);
f=u.match(/(?:^|\s)#\s*(\d{1,3})(?:\s|$)/);
p=u.match(/(?:^|\s)(\d{1,2})\s*명(?:\s|$)/);
if(p)d=Math.min(Math.max(Number(p[1]),2),20);
return{domain:"INHOUSE",action:"CREATE",mode:c,dateKey:O(u)||l(r,10)||null,time:I(" "+u+" ","21:00"),recruitNo:f?m(f[1],999):null,capacity:d,templateRequest:!u,invalidMode:o&&!c&&!O(o)&&o.charAt(0)!=="#"&&!/^\d{1,2}(?::\d{2}|시|명)/.test(o)?o:null}
;
}a=n.match(/^(?:내전상세)(?:\s*#?\s*(\d{1,3}))?$/);
if(a)return{domain:"INHOUSE",action:"DETAIL",recruitNo:a[1]?Number(a[1]):null}
;
a=n.match(/^(?:내전현황|시즌내전현황|AI공지)(?:\s*#?\s*(\d{1,3}))?$/);
if(a)return{domain:"INHOUSE",action:"STATUS",recruitNo:a[1]?Number(a[1]):null};
a=n.match(/^(?:내전참가|내전신청|참가신청)(?:\s*#?\s*(\d{1,3}))?$/);
if(a)return{domain:"INHOUSE",action:"JOIN",recruitNo:a[1]?Number(a[1]):null}
;
return null;
}function C(e){return u(e).replace(/\s+/g,"");
}
function D(e,r){var t=e.split("\n");
var n=0;
var a=0;
var u="";
var o="";
var s=null;
for(n=0;
n<t.length;
n+=1){u=i(t[n]);
for(a=0;
a<r.length;
a+=1){o=r[a].replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/\s+/g,"\\s*");
s=u.match(new RegExp("^"+o+"\\s*:\\s*(.*)$","i"));
if(s)return i(s[1])||null;
}}
return null;
}function G(e){var r=l(e,160);
if(/^(?:미정|없음|상대구함|상대\s*구함|모집중|비워두기|공란|-)$/.test(r))return null;
return r||null;
}
function x(e,r,t){var n=e.split("\n");
var a=!1;
var u=[];
var o=0;
var s="";
for(o=0;
o<n.length;
o+=1){s=i(n[o]);
if(!a&&r.test(s)){a=!0;
continue;
}if(a&&t&&t.test(s))break;
if(a)u.push(s);
}
return u.join("\n");
}function _(e,r){var t={top:null,jungle:null,mid:null,adc:null,support:null}
;
var n={TOP:"top",JGL:"jungle",MID:"mid",ADC:"adc",SUP:"support"};
var a=e.split("\n");
var u=0;
var o=null;
var s=null;
var l="";
var c=r?"(?:"+r.join("|")+")\\s*":"";
var m=new RegExp("^"+c+"(TOP|JUG|JGL|JG|MID|ADC|AD|SUP|탑|정글|미드|원딜|서폿|서포터)\\s*[.:]\\s*(.*)$","i");
for(u=0;
u<a.length;
u+=1){o=i(a[u]).match(m);
if(!o)continue;
s=h(o[1]);
l=n[s];
if(l&&t[l]===null)t[l]=G(o[2]);
}
return t;
}function M(e){var r=e.match(/(\d{1,2}\s*판\s*\d{1,2}\s*선|\d{1,2}\s*전\s*\d{1,2}\s*선|BO\s*\d{1,2})/i);
var t=e.match(/(\d{1,2})\s*(?:판|게임|세트|전)/);
var n=t?Number(t[1]):null;
return{gameCount:c(n,1,20)?n:null,seriesRuleText:r?r[1].replace(/\s+/g,""):t?t[0].replace(/\s+/g,""):null}
;
}function P(e){var r=s(e);
var t=r.ok?i(r.text):"";
var n=t.replace(/^\//,"");
var a=C(n);
var u=null;
var o=null;
var c=null;
var f="";
var p="";
var d=null;
var v=null;
var g=null;
var h=null;
var N=null;
var S=null;
var T=null;
var y=null;
var b="";
var A=null;
var L=null;
if(!t)return null;
u=a.match(/^(?:스크림참가|멸망전스크림참가)#?\d{1,3}.*$/);
if(u)return{domain:"SCRIM",action:"UNSUPPORTED",unsupportedKind:"JOIN"}
;
u=a.match(/^(?:스크림확정|멸망전스크림확정)#?\d{1,3}.*$/);
if(u)return{domain:"SCRIM",action:"UNSUPPORTED",unsupportedKind:"CONFIRM"};
u=a.match(/^(?:스크림취소|멸망전스크림취소)#?\d{1,3}.*$/);
if(u)return{domain:"SCRIM",action:"UNSUPPORTED",unsupportedKind:"CANCEL"}
;
u=a.match(/^(?:스크림마감|스크림종료|멸망전스크림마감|멸망전스크림종료)#?\d{1,3}.*$/);
if(u)return{domain:"SCRIM",action:"UNSUPPORTED",unsupportedKind:"FINISH"};
u=a.match(/^(?:스크림상세|멸망전스크림상세)#?(\d{1,3})$/);
if(u)return{domain:"SCRIM",action:"DETAIL",scrimNo:Number(u[1])}
;
if(/^(?:스크림현황|스크림목록|멸망전스크림현황|멸망전스크림목록)(?:#?\d{1,3})?$/.test(a)){u=a.match(/#?(\d{1,3})$/);
return{domain:"SCRIM",action:"STATUS",scrimNo:u?Number(u[1]):null};
}
o=/^(?:스크림구인|스크림모집|멸망전스크림|멸망전스크림구인|멸망전스크림모집)/.test(a)||/\[?K-?LOL\.GG(?:멸망전)?스크림구인양식\]?/.test(a)||/일시\s*:/.test(t)&&/방식\s*:/.test(t)&&/(?:우리팀|아군팀|요청팀)\s*:/.test(t)&&/상대팀\s*:/.test(t);
if(!o)return null;
if(/^(?:스크림구인|스크림모집|멸망전스크림|멸망전스크림구인|멸망전스크림모집)$/.test(a))return{domain:"SCRIM",action:"CREATE",templateRequest:!0,operationDate:null,scrimNo:null,tournamentNo:null,requesterTeamName:null,opponentTeamName:null,requesterLineup:{top:null,jungle:null,mid:null,adc:null,support:null},opponentLineup:{top:null,jungle:null,mid:null,adc:null,support:null}
,startTimeText:null,gameCount:null,seriesRuleText:null,memo:null};
g=O(D(t,["운영일","운영 일자"])||"");
u=(D(t,["스크림번호","스크림 번호","번호"])||"").match(/#?\s*(\d{1,3})/);
if(!u)u=t.match(/(?:^|\n)\s*#\s*(\d{1,3})\b/);
c=u?m(u[1],999):null;
T=D(t,["멸망전번호","멸망전 번호","대회번호","대회 번호","tournamentId"]);
u=T?T.match(/\d{1,4}/):null;
L=u?Number(u[0]):null;
h=D(t,["일시","시간","시작시간","스크림일시"]);
N=D(t,["방식","판수","게임수","진행방식"]);
S=M(N||t);
f=x(t,/^\s*(?:우리팀|아군팀|요청팀)(?:명|\s*라인업|\s*명단)?\s*:/i,/^\s*상대팀(?:명|\s*라인업|\s*명단)?\s*:/i);
p=x(t,/^\s*상대팀(?:명|\s*라인업|\s*명단)?\s*:/i,/^\s*(?:메모|비고|요청사항)\s*:/i);
d=_(f);
v=_(p);
if(!(d.top||d.jungle||d.mid||d.adc||d.support))d=_(t,["우리","아군","요청"]);
if(!(v.top||v.jungle||v.mid||v.adc||v.support))v=_(t,["상대"]);
A=G(D(t,["우리팀명","우리 팀명","아군팀명","요청팀명","우리팀","요청팀"]));
if(!/\n/.test(t)){b=i(n.replace(/^(?:스크림\s*구인|스크림\s*모집|멸망전\s*스크림\s*구인|멸망전\s*스크림\s*모집)\s*/i,""));
y=b.match(/^(\d{1,4})(?:\s+|$)/);
if(y&&L===null)L=Number(y[1]);
if(y)b=i(b.substring(y[0].length));
if(!A)A=G(b.split(/\s+/)[0]||"");
}
return{domain:"SCRIM",action:"CREATE",templateRequest:!1,operationDate:g,scrimNo:c,tournamentNo:L,requesterTeamName:A,opponentTeamName:G(D(t,["상대팀명","상대 팀명","상대팀"])),requesterLineup:d,opponentLineup:v,startTimeText:h||I(" "+t+" ",null),gameCount:S.gameCount,seriesRuleText:S.seriesRuleText||G(N),memo:!/\n/.test(t)?l(b,500)||null:G(D(t,["메모","비고","요청사항"]))};
}
function U(e){return i(e).replace(/^\d+\s*[.)]\s*/,"");
}function K(e){return i(e).replace(/\s+/g,"").replace(/[.:()\[\]{}<>·ㆍ,/\\_-]/g,"");
}
function w(e,r){return K(U(e)).indexOf(K(r))===0;
}function F(e,r){var t=e.split("\n");
var n=0;
var a=0;
var i=!1;
for(n=0;
n<r.length;
n+=1){i=!1;
for(a=0;
a<t.length;
a+=1)if(w(t[a],r[n])){i=!0;
break;
}
if(!i)return!1;
}return!0;
}
function $(e,r,t){var n=e.split("\n");
var a=[];
var u=!1;
var o=0;
var s=0;
var l="";
var c=String(r).replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/\s+/g,"\\s*");
var m=new RegExp("^\\s*"+c+"\\s*[:：]?\\s*","i");
for(o=0;
o<n.length;
o+=1){l=U(n[o]);
if(!u){if(w(l,r)){a.push(i(l.replace(m,"")));
u=!0;
}continue;
}
for(s=0;
s<t.length;
s+=1)if(w(l,t[s]))break;
if(s<t.length)break;
a.push(l);
}return i(a.join("\n"));
}
function k(e,r){var t=u(e).split("\n");
var n=[];
var a=0;
var o="";
for(a=0;
a<t.length;
a+=1){o=i(t[a]).replace(/^\s*:\s*/,"").replace(/^\s*-\s*/,"").replace(/^\s*[（(][^）)]*[）)]\s*/,"");
o=i(o.replace(/\s*\*\s*(?:EX\)?|예시|선택\s*:|특별한\s*사유\s*없이는)[\s\S]*$/i,""));
if(!o||/^\(?\s*(?:소통방\s*,\s*구인방\s*,?\s*디코?|게임명\s*적기|장기\s*,\s*단기\s*,\s*특정\s*게임.*)\s*\)?$/.test(o))continue;
n.push(o);
}o=i(n.join("\n"));
if(!o||o.length>r||/^[.:\-_/()\[\]{}\s]+$/.test(o))return"";
return o;
}
function j(e,r){var t=k(e,180);
var n=l(r,100)||"카카오 사용자";
var a=t?t.split(/\s*(?:\/|\||,|·)\s*/):[];
var i=l(a[0]||n,100)||n.substring(0,100);
var u=l(a[1]||a[0]||n,64)||n.substring(0,64);
return{name:i,nickname:u};
}
function B(e){var r=K(e).toLowerCase();
if(/^(?:x|아니오|아니요|안함|변경안함|없음|no|false)$/.test(r))return!1;
return /(?:o|예|네|변경|yes|true)/.test(r);
}function V(e){var r=u(e).split(/\n|,/);
var t=[];
var n={}
;
var a=0;
var i="";
for(a=0;
a<r.length;
a+=1){i=l(r[a].replace(/^\s*[-*]?\s*\d*\s*[.)]?\s*/,""),100);
if(!i||n[i])continue;
n[i]=!0;
t.push(i);
if(t.length>30)return[];
}return t;
}
function J(e){var r=k(e,160);
var t=r.match(/20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}/g)||[];
var n=t[0]?O(t[0]):null;
var a=t[1]?O(t[1]):n;
if(n&&a&&a>=n)return{periodStart:n,periodEnd:a,legacyPeriodText:null};
return r?{periodStart:null,periodEnd:null,legacyPeriodText:r}
:null;
}function H(e){var r=k(e,160);
var t=u(e).replace(/\s+/g,"");
var n=[];
if(/소통방/.test(t))n.push("소통방");
if(/구인방/.test(t))n.push("구인방");
if(/디코|디스코드/.test(t))n.push("디코");
return n.length?n.join(", "):r;
}
function Y(e,r){var t=s(e);
var n=t.ok?i(t.text):"";
var a=null;
var u=null;
var o=null;
var l=null;
var c=null;
if(!n)return null;
if(F(n,["지인 이름","지인 닉네임","이용기간","디스코드 닉네임 변경"])){a=j("",r);
c={applicantName:a.name,applicantNickname:a.nickname,friendName:k($(n,"지인 이름",["지인 닉네임","이용기간","디스코드 닉네임 변경"]),100),friendNickname:k($(n,"지인 닉네임",["이용기간","디스코드 닉네임 변경"]),64),usagePeriod:k($(n,"이용기간",["디스코드 닉네임 변경"]),160),discordNicknameChange:B($(n,"디스코드 닉네임 변경",[]))};
if(!c.friendName||!c.friendNickname||!c.usagePeriod)return null;
return{domain:"OPERATION_FORM",action:"SUBMIT",formType:"friends",payload:c}
;
}if(F(n,["본인 이름 및 닉네임","건의 사유","건의 내용"])){a=j($(n,"본인 이름 및 닉네임",["건의 사유","건의 내용"]),r);
c={applicantName:a.name,applicantNickname:a.nickname,reason:k($(n,"건의 사유",["건의 내용"]),500),content:k($(n,"건의 내용",[]),4e3)}
;
if(!c.reason||!c.content)return null;
return{domain:"OPERATION_FORM",action:"SUBMIT",formType:"suggestions",payload:c};
}
if(F(n,["주최자 이름 및 닉네임","일자","장소","참여자 명단"])){a=j($(n,"주최자 이름 및 닉네임",["일자","장소","참여자 명단"]),r);
u=k($(n,"일자",["장소","참여자 명단"]),160);
l=V($(n,"참여자 명단",[]));
c={hostName:a.name,hostNickname:a.nickname,meetupAt:null,legacyDateText:u,location:k($(n,"장소",["참여자 명단"]),240),participants:l};
if(!c.legacyDateText||!c.location||l.length<1)return null;
return{domain:"OPERATION_FORM",action:"SUBMIT",formType:"meetups",payload:c}
;
}if(F(n,["이름 및 닉네임","외출기간","외출사유","외출범위"])){a=j($(n,"이름 및 닉네임",["외출기간","외출사유","외출범위"]),r);
o=J($(n,"외출기간",["외출사유","외출범위"]));
if(!o)return null;
c={applicantName:a.name,applicantNickname:a.nickname,periodStart:o.periodStart,periodEnd:o.periodEnd,reason:k($(n,"외출사유",["외출범위"]),1e3),scope:H($(n,"외출범위",[]))}
;
if(o.legacyPeriodText)c.legacyPeriodText=o.legacyPeriodText;
if(!c.reason||!c.scope)return null;
return{domain:"OPERATION_FORM",action:"SUBMIT",formType:"leaves",payload:c};
}
return null;
}function q(e){var r=s(e);
var t=r.ok?i(r.text):"";
var n=t.replace(/\s+/g,"");
if(!t)return null;
if(t.charAt(0)==="["&&t.indexOf("양식")>=0&&/\sv\d+/i.test(t)){if(/징계|경고/.test(t))return{domain:"MANAGED",action:"DISCIPLINE_CREATE"}
;
if(/내전|경기|결과/.test(t))return{domain:"MANAGED",action:"INHOUSE_RESULT"};
return{domain:"MANAGED",action:"REGISTRATION_HUB"}
;
}if(t.indexOf("\n")>=0)return null;
if(/^\/?(?:등록|등록도움말)$/.test(n))return{domain:"MANAGED",action:"REGISTRATION_HUB"}
;
if(/^\/?(?:사진취소|V2사진취소)$/.test(n))return{domain:"MANAGED",action:"PHOTO_CANCEL"};
if(/^\/?(?:내전등록|결과등록|내전결과)(?:\s+.+)?$/.test(t))return{domain:"MANAGED",action:"INHOUSE_RESULT"}
;
if(/^\/?(?:내전등록현황|결과현황)(?:\s+.+)?$/.test(t)||/^\/?내전현황\s+MR[A-F0-9]{10,16}$/i.test(t))return{domain:"MANAGED",action:"INHOUSE_RESULT_STATUS"};
if(/^\/?(?:경고등록|경고)(?:\s+.+)?$/.test(t))return{domain:"MANAGED",action:"DISCIPLINE_CREATE"}
;
if(/^\/?(?:인증|경고인증|경고인증완료)(?:\s+.+)?$/.test(t))return{domain:"MANAGED",action:"DISCIPLINE_EVIDENCE"};
if(/^\/?경고현황(?:\s+.+)?$/.test(t))return{domain:"MANAGED",action:"DISCIPLINE_STATUS"}
;
return null;
}function X(e,r,t){var n=s(e);
var a="";
var i=null;
if(!n.ok)return{domain:"INPUT",action:"REJECT",error:n.error}
;
a=o(n.text);
i=q(a);
if(i)return i;
i=Y(a,r);
if(i)return i;
i=E(a,t);
if(i)return i;
i=P(a);
if(i)return i;
return b(a);
}return{VERSION:"KLOL_V41_V1_COMPAT_2026_09_09_SLASH_PARITY",limits:{maximumInputLength:e,maximumInputLines:r,maximumMembers:t}
,normalizeText:u,canonicalCommandText:o,validateInput:s,parsePartyCreateCommand:p,parsePartyFinishCommand:d,parsePartyForm:T,isPartyFormWithoutNumber:y,classifyPartyCommand:b,parseInhouseCommand:E,parseScrimCommand:P,parseOperationForm:Y,classifyManagedCommand:q,classifyMessage:X};
}
();
if(typeof module!="undefined"&&module.exports)module.exports=r;
var t="KLOL_KAKAO_BOT_V41_V2_2026_09_09_R7_SLASH_PARITY";
var n=6e5;
var a=18e5;
function i(e){return String(e==null?"":e).replace(/^\s+|\s+$/g,"");
}function u(e){return Object.prototype.toString.call(e)==="[object Array]";
}
function o(e){return String(e==null?"":e).replace(/[\u200b-\u200d\u2060\ufeff]/g,"").replace(/\r\n?/g,"\n").replace(/[\u00a0\u3000]/g," ").replace(/／/g,"/").replace(/，/g,",").replace(/：/g,":").replace(/＃/g,"#").replace(/．/g,".").replace(/[–—]/g,"-").replace(/０/g,"0").replace(/１/g,"1").replace(/２/g,"2").replace(/３/g,"3").replace(/４/g,"4").replace(/５/g,"5").replace(/６/g,"6").replace(/７/g,"7").replace(/８/g,"8").replace(/９/g,"9");
}function s(e){var r=i(e);
return r.indexOf("오픈채팅봇")>=0||r.indexOf("K-LOL")>=0||r.indexOf("구인구직 도우미")>=0||r.indexOf("구인도우미")>=0;
}
function l(e){try{return i(String(DataBase.getDataBase(e)||""));
}catch(e){return"";
}
}function c(r){try{return e.publicBaseUrl()+String(r||"");
}
catch(e){return"KLOL_V2_BASE_URL 설정 후 열기: "+String(r||"/");
}}
function m(e,r){if(e&&e.reply)e.reply(String(r));
return!0;
}function f(e){var r=new Error(String(e));
r.v41UserSafe=!0;
return r;
}
function p(r){var t=r&&r.body;
var n=t&&typeof t.detail=="string"?String(t.detail):"";
if(!(r&&r.ok||n.indexOf("[K-LOL.GG 요청 실패]")!==0))return n;
if(t&&typeof t.legacyReply=="string"&&i(t.legacyReply))return String(t.legacyReply);
return e.userMessage(r);
}function d(){var e=new java.text.SimpleDateFormat("yyyy-MM-dd");
e.setTimeZone(java.util.TimeZone.getTimeZone("Asia/Seoul"));
return String(e.format(new java.util.Date));
}
function v(e){var r=String(e||"").match(/회차\s*[:：]\s*#?\s*(\d{1,3})/);
if(!r)r=String(e||"").match(/#\s*(\d{1,3})/);
var t=r?Number(r[1]):1;
return t>=1&&t<=999?t:1;
}function g(){var e=l("KLOL_V2_ACTIVE_SEASON_ID");
if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(e))throw new Error("V2 활성 시즌 ID 설정을 확인해 주세요.");
return e;
}
function h(e){return{TOP:"탑",JGL:"정글",MID:"미드",ADC:"원딜",SUP:"서포터"}[String(e||"")]||String(e||"미정");
}
function N(e){var r=Number(e||0);
if(!isFinite(r))r=0;
return String(Math.round(r*10)/10).replace(/\.0$/,"")+"%";
}function S(e){if(!e||!e.ok)return p(e);
var r=e.body&&typeof e.body=="object"?e.body:{}
;
if(typeof r.legacyReply=="string"&&i(r.legacyReply))return String(r.legacyReply);
if(typeof r.reply=="string"&&i(r.reply))return String(r.reply);
var t=u(r.recentMatches)?r.recentMatches:[];
var n=r.mode==="RECENT"?"RECENT":"RECORD";
var a=r.player?String(r.player.riotId||r.player.displayName||"플레이어"):"플레이어";
var o=[n==="RECENT"?"["+a+" 최근 경기]":"["+a+" 전적]",""];
var s=0;
if(!r.player)return o[0]+"\n\n일치하는 플레이어를 찾지 못했습니다.";
if(n==="RECORD"){if(r.season)o.push("시즌: "+r.season.name);
if(r.currentTier||r.peakTier)o.push("티어: "+String(r.currentTier||"-")+" / "+String(r.peakTier||"-"));
if(r.summary){o.push("참여: "+Number(r.summary.participationCount||0)+"회 / "+Number(r.summary.totalGames||0)+"세트");
o.push("전적: "+Number(r.summary.wins||0)+"승 "+Number(r.summary.losses||0)+"패 ("+N(r.summary.winRate)+")");
o.push("KDA: "+Number(r.summary.kda||0).toFixed(2)+" ("+Number(r.summary.kills||0)+"/"+Number(r.summary.deaths||0)+"/"+Number(r.summary.assists||0)+")");
o.push("MVP: "+Number(r.summary.mvpCount||0)+"회");
}else o.push("집계된 시즌 전적이 없습니다.");
if(t.length){o.push("");
o.push("최근: "+(t[0].won===!0?"승":"패")+" "+String(t[0].championName||"챔피언 미정")+" "+Number(t[0].kills||0)+"/"+Number(t[0].deaths||0)+"/"+Number(t[0].assists||0));
}
}else{for(s=0;
s<t.length&&s<10;
s+=1)o.push(s+1+". "+(t[s].won===!0?"승":"패")+" | "+String(t[s].championName||"챔피언 미정")+" | "+Number(t[s].kills||0)+"/"+Number(t[s].deaths||0)+"/"+Number(t[s].assists||0));
if(!t.length)o.push("표시할 최근 경기가 없습니다.");
}
o.push("",c("/players/"+r.player.playerId));
return o.join("\n");
}function T(e){if(!e||!e.ok)return p(e);
var r=e.body&&typeof e.body=="object"?e.body:{}
;
if(typeof r.legacyReply=="string"&&i(r.legacyReply))return String(r.legacyReply);
if(typeof r.reply=="string"&&i(r.reply))return String(r.reply);
var t=u(r.rows)?r.rows:[];
var n=["🏆 K-LOL.GG 랭킹 TOP 5","기준: 내전 참여 "+Number(r.minimumParticipation||0)+"회 이상",""];
var a=0;
for(a=0;
a<t.length&&a<5;
a+=1){var o=t[a];
n.push(Number(o.rank||a+1)+". "+String(o.riotId||o.displayName)+" | 승률 "+N(o.winRate)+" | 참여 "+Number(o.participationCount||0)+"회 | "+Number(o.totalGames||0)+"세트 | KDA "+Number(o.kda||0).toFixed(2));
}if(!t.length)n.push("표시할 랭킹 기록이 없습니다.");
return n.join("\n");
}
function y(e){if(!e||!e.ok)return p(e);
var r=e.body&&typeof e.body=="object"?e.body:{};
var t=r.positionCounts&&typeof r.positionCounts=="object"?r.positionCounts:{}
;
var n=u(r.shortagePositions)?r.shortagePositions:[];
var a=[];
var i=0;
for(i=0;
i<n.length;
i+=1)a.push(h(n[i]));
return["[K-LOL.GG 내전 공지 미리보기]","읽기 전용 미리보기이며 실제 방 자동 발송은 하지 않았습니다.","날짜: "+String(r.date||"오늘")+(r.slot?" · 시간: "+String(r.slot)+"시":""),r.seasonId?"활성 시즌 신청 현황":"활성 시즌이 없습니다.","신청 "+Number(r.total||0)+"/"+Number(r.targetCount||10)+" · 남은 인원 "+Number(r.remaining||0)+"명","포지션: 탑 "+Number(t.TOP||0)+" · 정글 "+Number(t.JGL||0)+" · 미드 "+Number(t.MID||0)+" · 원딜 "+Number(t.ADC||0)+" · 서포터 "+Number(t.SUP||0),"부족 포지션: "+(a.length?a.join(", "):"없음")].join("\n");
}function b(e){var r=String(e&&e.type||"");
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
}
function A(e){var r=i(e&&e.startTimeText);
var t=e&&e.scheduledStartAt;
var n=null;
if(r)return r;
if(!t)return"미정";
n=String(t).match(/T(\d{2}):(\d{2})/);
return n?n[1]+":"+n[2]:"미정";
}function L(e){var r=e&&u(e.members)?e.members:[];
var t=[];
var n=0;
for(n=0;
n<r.length;
n+=1)if(!r[n].substitute&&r[n].name)t.push(String(r[n].name));
return t;
}
function O(e){var r=i(e&&(e.gameInfo||e.note))||"미입력";
return"#"+Number(e.recruitNumber)+" · "+b(e)+" · "+Number(e.memberCount||0)+"/"+Number(e.maximumMembers||0)+" · "+A(e)+" · "+r;
}function I(e){var r=e&&e.body;
var t=r&&u(r.parties)?r.parties:[];
var n=["[K-LOL.GG 구인구직 현황]"];
var a=[];
var i=0;
if(!e||!e.ok)return p(e);
if(!t.length)return n.concat(["","현재 진행 중인 구인글이 없습니다."]).join("\n");
n.push("🔎 전체 명단: 상세 번호","","[구인중]");
for(i=0;
i<t.length;
i+=1){n.push(O(t[i]));
a=L(t[i]);
if(a.length)n.push("참여: "+a.join(", "));
n.push("└ 상세 "+Number(t[i].recruitNumber));
if(i+1<t.length)n.push("");
}
return n.join("\n");
}function R(e){var r=e&&e.body;
var t=r&&u(r.parties)?r.parties:[];
var n=r&&u(r.scrims)?r.scrims:[];
var a=["[K-LOL.GG 구인 현황]"];
var i=0;
if(!e||!e.ok)return p(e);
for(i=0;
i<t.length;
i+=1)a.push("파티 #"+t[i].recruitNumber+" · "+t[i].title+" · "+t[i].memberCount+"/"+t[i].maximumMembers+(Number(t[i].reserveCount||0)?" · 예비 "+Number(t[i].reserveCount):""));
for(i=0;
i<n.length;
i+=1)a.push("스크림 #"+n[i].scrimNumber+" · "+n[i].status+" · BO"+n[i].bestOf);
if(a.length===1)a.push("현재 진행 중인 모집이 없습니다.");
return a.join("\n");
}
function E(e,r,t){var n=String(e.title||Number(e.maximumMembers)+"인 파티 구인");
var a=i(t&&t.startTimeText)||i(e.startTimeText);
var u=i(t&&t.gameInfo)||i(e.gameInfo);
var o=["[K-LOL.GG 구인구직 양식]","같이 할사람~","","아래 양식의 모집번호는 유지해서 작성해주세요.","","📢 "+n,"모집번호: #"+Number(r),"","》시작시간 :"+(a?" "+a:""),"》게임정보 :"+(u?" "+u:""),""];
var s=["TOP.","JUG.","MID.","ADC.","SUP."];
var l=e.type==="FLEX_RANK"||e.type==="NORMAL_GAME"||e.type==="PARTY_RIFT";
var c=0;
if(l){for(c=0;
c<s.length;
c+=1)o.push(s[c]);
o.push("예비 1.","","마지막 참가자가 전체 태그 해주세요.","*상호배려와 존중 부탁드립니다.");
}else{for(c=1;
c<=Number(e.maximumMembers);
c+=1)o.push(c+".");
o.push("예비 1.","","참여해주실 분은 태그해주세요.","*상호배려와 존중 부탁드립니다.");
}
return o.join("\n");
}function C(e){return i(e).replace(/[\r\n|]+/g," ").replace(/\s+/g," ");
}
function D(e){return{APPLIED:"신청",RESERVE:"예비",CONFIRMED:"확정",REJECTED:"거절",CANCELLED:"취소",MATCHED_RESERVE:"예비 · 확인 필요",UNMATCHED:"플레이어 확인 필요",AMBIGUOUS:"동명이인 확인 필요"}[String(e||"")]||C(e);
}
function G(e){var r=e&&e.body;
var t=r&&u(r.entries)?r.entries:[];
var n=["[K-LOL.GG 내전 참가 신청]"];
var a=0;
if(!e||!e.ok)return p(e);
if(r&&typeof r.legacyReply=="string"&&i(r.legacyReply))return String(r.legacyReply);
n.push("신청일: "+r.applyDate);
n.push("회차: #"+r.recruitNo);
n.push("신청 "+Number(r.appliedCount||0)+" · 예비 "+Number(r.reserveCount||0)+" · 확정 "+Number(r.confirmedCount||0)+" · 확인 필요 "+Number(r.pendingCount||0));
for(a=0;
a<t.length;
a+=1){var o=t[a];
var s=o.player?o.player.displayName:o.suppliedName;
var l=o.player?o.player.riotId:o.suppliedRiotId;
var c=u(o.subPositions)&&o.subPositions.length?o.subPositions.join(", "):"없음";
n.push(o.slotNo+". 플레이어: "+C(s)+" | Riot ID: "+C(l||"없음")+" | 주라인: "+C(o.mainPosition||"ALL")+" | 부라인: "+C(c)+" | 상태: "+D(o.status)+" | 출처: "+(o.source==="SITE"?"SITE":"KAKAO"));
}return n.join("\n");
}
function x(e){var r=i(e).toUpperCase();
if(r==="탑"||r==="T")return"TOP";
if(r==="정글"||r==="JG"||r==="JUG")return"JGL";
if(r==="미드"||r==="MD"||r==="M")return"MID";
if(r==="원딜"||r==="AD"||r==="원딜러")return"ADC";
if(r==="서폿"||r==="서포터"||r==="S")return"SUP";
if(r==="올"||r==="전체"||r==="FILL")return"ALL";
if(/^(TOP|JGL|MID|ADC|SUP|ALL)$/.test(r))return r;
return null;
}function _(e){var r=String(e||"").replace(/\r\n?/g,"\n").split("\n");
var t=[];
var n=0;
for(n=0;
n<r.length;
n+=1){var a=i(r[n]).match(/^(\d{1,2})\s*[.)]\s*(.+)$/);
if(!a||/^(?:EX|예시)/i.test(a[2]))continue;
if(a[2].indexOf("플레이어:")>=0||a[2].indexOf("플레이어：")>=0){var u=a[2].split("|");
var o={}
;
var s=0;
for(s=0;
s<u.length;
s+=1){var l=i(u[s]).match(/^([^:：]+)\s*[:：]\s*(.*)$/);
if(l)o[i(l[1]).toLowerCase()]=i(l[2]);
}var c=o["플레이어"]||o["이름"];
var m=o["riot id"]||o["라이엇 id"]||null;
var f=x(o["주라인"]||o["주 포지션"]);
var p=[];
var d=String(o["부라인"]||o["부 포지션"]||"").split(/[,，]/);
var v=0;
if(!c||!f)throw new Error(a[1]+"번 신청자의 플레이어 또는 주라인을 확인해 주세요.");
for(v=0;
v<d.length;
v+=1){var g=i(d[v]);
if(!g||/^(?:없음|-)$/.test(g))continue;
var h=x(g);
if(!h||h===f||h==="ALL"||p.indexOf(h)>=0)throw new Error(a[1]+"번 신청자의 부라인을 확인해 주세요.");
p.push(h);
}
if(f==="ALL"&&p.length)throw new Error(a[1]+"번 신청자의 부라인을 확인해 주세요.");
if(m&&/^(?:없음|-)$/.test(m))m=null;
t.push({slotNo:Number(a[1]),name:c,riotId:m,mainPosition:f,subPositions:p,reserve:/(?:예비|대기|MATCHED_RESERVE|RESERVE)/i.test(o["상태"]||"")});
continue;
}
if(a[2].indexOf("/")<0)continue;
var N=a[2].split("/");
if(N.length<4)continue;
var S=i(N[0]);
var T=i(N.slice(3).join("/")).split(/[\/,，]/);
var y=x(T[0]);
if(!S||!y)throw new Error(a[1]+"번 신청자의 이름 또는 포지션을 확인해 주세요.");
var b=[];
var A=1;
for(A=1;
A<T.length;
A+=1){var L=x(T[A]);
if(L&&L!==y&&L!=="ALL"&&b.indexOf(L)<0)b.push(L);
}t.push({slotNo:Number(a[1]),name:S,riotId:null,mainPosition:y,subPositions:b,reserve:/(?:예비|대기)/.test(a[2])}
);
}if(!t.length)throw new Error("내전 신청자 줄을 찾지 못했습니다.");
return t;
}
function M(e){var r=String(e||"").match(/(20\d{2}-\d{2}-\d{2})/);
return r?r[1]:d();
}function P(e){var r=o(e).split("\n");
var t=[];
var n=0;
for(n=0;
n<r.length;
n+=1){if(/^\s*\d{1,2}\s*[.)]/.test(r[n]))break;
t.push(r[n]);
}
return t.join("\n");
}function U(e){var r=P(e);
var t=r.match(/(?:신청일|날짜|일자)\s*[:：]\s*(20\d{2}-\d{2}-\d{2})/);
if(!t)throw f("내전 전체 양식에 신청일: YYYY-MM-DD를 적어 주세요.");
var n=new Date(t[1]+"T00:00:00Z");
if(isNaN(n.getTime())||n.toISOString().substring(0,10)!==t[1])throw f("내전 전체 양식의 신청일을 확인해 주세요.");
return t[1];
}
function K(e){var r=P(e);
var t=r.match(/회차\s*[:：]\s*#?\s*(\d{1,3})/);
if(!t)t=r.match(/내전\s*(?:번호|NO)\s*[:：]?\s*#?\s*(\d{1,3})/i);
if(!t)t=r.match(/(?:협곡\s*)?내전[^\n#]*#\s*(\d{1,3})/);
var n=t?Number(t[1]):0;
if(!n||n<1||n>999)throw f("내전 전체 양식에 회차: #번호를 적어 주세요.");
return n;
}function w(e){var r=JSON.stringify(e);
var t=2166136261;
var n=0;
for(n=0;
n<r.length;
n+=1){t^=r.charCodeAt(n);
t=Math.imul?Math.imul(t,16777619):t*16777619|0;
}
return("00000000"+(t>>>0).toString(16)).slice(-8).toUpperCase();
}function F(r,t){var n=e.identityForChat(r,t);
return"KLOL_V41_SEASON_PREVIEW_"+n.roomId.substring(5)+"_"+n.senderId.substring(7);
}
function $(e,r){try{DataBase.setDataBase(F(e,r),"");
}catch(e){}
}function k(e,r,t){DataBase.setDataBase(F(e,r),JSON.stringify(t));
}
function j(e,r){var t=null;
try{t=JSON.parse(String(DataBase.getDataBase(F(e,r))||"null"));
}catch(e){}
if(!t||typeof t!="object"||typeof t.code!="string"||typeof t.createdAt!="number"||typeof t.applyDate!="string"||typeof t.recruitNo!="number"||!u(t.participants)){$(e,r);
return null;
}if((new Date).getTime()-t.createdAt>n){$(e,r);
return null;
}
return t;
}function B(r,t,n){var a=U(n);
var i=K(n);
var u=_(n);
var o={}
;
var s=0;
if(u.length>99)throw f("내전 전체 양식은 회차당 최대 99명까지 확인할 수 있습니다.");
for(s=0;
s<u.length;
s+=1){if(o[String(u[s].slotNo)])throw f("내전 전체 양식에 중복된 번호가 있습니다.");
o[String(u[s].slotNo)]=!0;
}var l={applyDate:a,recruitNo:i,participants:u}
;
var c=w(l);
var m=String(e.newUuid()).replace(/-/g,"").substring(0,6).toUpperCase();
var p={code:m,createdAt:(new Date).getTime(),applyDate:a,recruitNo:i,participants:u,count:u.length,hash:c};
k(r,t,p);
return["[K-LOL.GG 내전 신청 미리보기]","아직 사이트에 반영하지 않았습니다.","신청일: "+a+" · 회차: #"+i,"인원: "+u.length+"명 · 요약 해시: "+c,"10분 안에 /내전확인 "+m+" 를 보내면 한 번만 반영합니다.","취소: /내전미리보기취소","주의: 확인하면 이 전체 양식에서 빠진 기존 카카오 신청은 취소될 수 있습니다."].join("\n");
}
function V(r,t,n,a){var i=j(r,t);
if(!i)return m(a,"[K-LOL.GG 내전 신청]\n확인할 미리보기가 없거나 10분이 지났습니다. 전체 양식을 다시 보내 주세요.");
if(i.code!==String(n||"").toUpperCase())return m(a,"[K-LOL.GG 내전 신청]\n확인 코드가 일치하지 않습니다. 미리보기의 코드를 확인해 주세요.");
$(r,t);
var u=e.seasonApplications({action:"SYNC",seasonId:g(),applyDate:i.applyDate,recruitNo:i.recruitNo,participants:i.participants},e.contextFromChat(r,t));
return m(a,G(u));
}
function J(e){var r=o(e);
return /내전하실분\s*#\s*\d{1,3}/.test(r)&&/참가\s*신청\s*양식/.test(r)&&/이름\s*\/\s*현티어\s*\/\s*최고티어/.test(r)&&/^\s*\d{1,2}\s*[.)]/m.test(r);
}function H(r,t,n){var a=e.identityForChat(r,t);
return"KLOL_V41_V1_SEASON_SYNC_"+a.roomId.substring(5)+"_"+a.senderId.substring(7)+"_"+w(o(n));
}
function Y(r,t,n,a){var i=H(t,n,r);
if(String(DataBase.getDataBase(i)||"")==="done")return!0;
var u=M(r);
var s=K(r);
var l=_(r);
var c=e.seasonApplications({action:"SYNC",seasonId:g(),applyDate:u,recruitNo:s,participants:l},e.contextFromChat(t,n,{requestKey:"mbr-v41-v1-season-"+w(o(r)).toLowerCase()}
));
if(c&&c.ok)DataBase.setDataBase(i,"done");
return m(a,G(c));
}function q(e,r){var t=JSON.parse(i(String(e).substring(r.length)));
if(!t||typeof t!="object"||u(t))throw new Error("JSON 객체 형식을 확인해 주세요.");
return t;
}
function X(e){return String(e||"").indexOf("SCRIM")>=0?"SCRIM":"PARTY";
}function Z(r,t){var n=e.identityForChat(r,"recruit-state");
return"KLOL_V41_RECRUIT_"+t+"_"+n.roomId.substring(5);
}
function z(e,r){try{var t=JSON.parse(String(DataBase.getDataBase(Z(e,r))||"null"));
if(t&&typeof t.aggregateId=="string"&&typeof t.revision=="number")return t;
}catch(e){}
return null;
}function W(e,r,t){var n=t&&t.body;
if(!t||!t.ok||!n||typeof n.aggregateId!="string"||typeof n.revision!="number")return;
DataBase.setDataBase(Z(e,r),JSON.stringify({aggregateId:n.aggregateId,revision:n.revision,status:n.status}
));
}function Q(r,t,n,a){var i=q(r,"V2모집");
var u=String(i.type||"");
var o=X(u);
var s=u.indexOf("CREATE_")===0;
var l=s?null:z(t,o);
var c=typeof i.aggregateId=="string"?i.aggregateId:l?l.aggregateId:"";
var f=typeof i.expectedRevision=="number"?i.expectedRevision:s?0:l?l.revision:-1;
if(s&&!c)c=e.newUuid();
if(!c||f<0)throw new Error("모집 ID 또는 최신 revision을 확인해 주세요.");
var d={type:u,aggregateId:c,payload:i.payload}
;
var v=e.recruit(d,e.contextFromChat(t,n,{expectedRevision:f}));
W(t,o,v);
m(a,p(v));
}
function ee(){if(typeof r=="undefined"||!r||!r.classifyMessage)throw new Error("V1 호환 파서가 로드되지 않았습니다.");
return r;
}function re(r,t,n){var a=e.identityForChat(r,t);
return"KLOL_V41_INTENT_"+a.roomId.substring(5)+"_"+a.senderId.substring(7)+"_"+w(o(n));
}
function te(e,r,t){var a=re(e,r,t);
var i=(new Date).getTime();
var u=null;
try{u=JSON.parse(String(DataBase.getDataBase(a)||"null"));
}catch(e){}
if(u&&typeof u=="object"&&typeof u.createdAt=="number"&&i-u.createdAt>=0&&i-u.createdAt<=n&&typeof u.requestKey=="string")return u;
return null;
}function ne(r,t,n,a){var i=re(r,t,n);
var u=(new Date).getTime();
var o=te(r,t,n);
if(o)return o;
o=a();
o.createdAt=u;
o.requestKey="mbr-v41-legacy-"+w({room:e.identityForChat(r,t).roomId,sender:e.identityForChat(r,t).senderId,text:n,createdAt:u}
).toLowerCase();
DataBase.setDataBase(i,JSON.stringify(o));
return o;
}function ae(r,t){var n=e.openchatStatus(e.contextFromChat(r,t));
if(!n||!n.ok||!n.body||typeof n.body!="object")throw f(p(n));
return n;
}
function ie(e,r){var t=e&&e.body&&u(e.body.parties)?e.body.parties:[];
var n=d();
var a=0;
for(a=0;
a<t.length;
a+=1)if(String(t[a].recruitDate||n)===n&&Number(t[a].recruitNumber)===Number(r))return t[a];
return null;
}function ue(e,r){var t=e&&e.body&&u(e.body.scrims)?e.body.scrims:[];
var n=d();
var a=0;
for(a=0;
a<t.length;
a+=1)if(String(t[a].recruitDate||n)===n&&Number(t[a].scrimNumber)===Number(r))return t[a];
return null;
}
function oe(e){var r=u(e.members)?e.members:[];
var t={TOP:1,JGL:2,MID:3,ADC:4,SUP:5};
var n=[];
var a=0;
for(a=0;
a<r.length;
a+=1){if(!r[a].name||String(r[a].name).length>80)throw f("참가자 이름은 80자 이내로 적어 주세요.");
n.push({name:String(r[a].name),position:r[a].position||null,slotNo:Number(r[a].slotNo||t[r[a].position]||a+1),substitute:r[a].substitute===!0}
);
}return n;
}
function se(e,r){var t=String(r||"").match(/(?:^|\s)((?:[01]?\d|2[0-3]):[0-5]\d)(?:\s|$)/);
if(!t)return null;
var n=new Date(e+"T"+String(t[1]).replace(/^(\d):/,"0$1:")+":00+09:00");
return isNaN(n.getTime())?null:n.toISOString();
}function le(e){var r=e&&u(e.members)?e.members:[];
var t=["[K-LOL.GG 파티 #"+Number(e.recruitNumber)+"]",String(e.title||"파티 구인")];
var n=0;
t.push("인원 "+Number(e.memberCount||0)+"/"+Number(e.maximumMembers||0)+(Number(e.reserveCount||0)?" · 예비 "+Number(e.reserveCount):""));
t.push("시작시간: "+A(e)+" · 게임정보: "+(i(e.gameInfo||e.note)||"미입력"));
for(n=0;
n<r.length;
n+=1)t.push((r[n].substitute?"예비 ":"")+Number(r[n].slotNo||n+1)+". "+String(r[n].name||"이름 미정")+(r[n].position?" · "+h(r[n].position):""));
if(!r.length)t.push("아직 참가자가 없습니다.");
return t.join("\n");
}
function ce(e){return{RECRUITING:"모집중",MATCHED:"매칭완료",CONFIRMED:"확정",COMPLETED:"완료",CANCELED:"취소",CANCELLED:"취소"}[String(e||"")]||String(e||"");
}
function me(e){var r=e&&e.startTimeText?String(e.startTimeText):"미정";
var t=e&&e.scheduledAt?new Date(e.scheduledAt):null;
if(!t||isNaN(t.getTime()))return r;
var n=new Date(t.getTime()+324e5);
var a=String(n.getUTCHours());
var i=String(n.getUTCMinutes());
if(a.length<2)a="0"+a;
if(i.length<2)i="0"+i;
return String(n.getUTCMonth()+1)+"/"+String(n.getUTCDate())+" "+a+":"+i;
}function fe(e){return String(e.seriesRuleText||(e.bestOf?Number(e.bestOf)+"판":"판수 미정"));
}
function pe(e){return"#"+Number(e.scrimNumber)+" "+String(e.requesterTeamName||"요청팀 미정")+" vs "+String(e.opponentTeamName||"상대구함")+" / "+me(e)+" / "+fe(e)+" / "+ce(e.status);
}function de(e){var r=e&&e.body;
var t=r&&u(r.scrims)?r.scrims:[];
var n=["[K-LOL.GG 스크림 현황]"];
var a=0;
if(!e||!e.ok)return p(e);
if(!t.length)return n.concat(["","현재 모집중/확정된 스크림이 없습니다."]).join("\n");
n.push("🔎 전체 양식: 스크림상세 번호","");
for(a=0;
a<t.length;
a+=1){n.push(pe(t[a]));
n.push("└ 스크림상세 "+Number(t[a].scrimNumber));
}
return n.join("\n");
}function ve(e){var r=e.requesterLineup||{}
;
var t=e.opponentLineup||{};
return["운영일: "+String(e.recruitDate||d()),"번호: #"+Number(e.scrimNumber),"일시: "+me(e),"방식: "+fe(e),"","우리팀: "+String(e.requesterTeamName||""),"TOP: "+String(r.top||""),"JUG: "+String(r.jungle||""),"MID: "+String(r.mid||""),"ADC: "+String(r.adc||""),"SUP: "+String(r.support||""),"","상대팀: "+String(e.opponentTeamName||""),"TOP: "+String(t.top||""),"JUG: "+String(t.jungle||""),"MID: "+String(t.mid||""),"ADC: "+String(t.adc||""),"SUP: "+String(t.support||"")];
}
function ge(e){var r=["[K-LOL.GG 멸망전 스크림 상세]","",pe(e),""];
r=r.concat(ve(e));
r.push("","수정: 이 메시지를 복사해 내용을 고친 뒤 전체 전송");
return r.join("\n");
}function he(r,t,n,a){var i=ne(r,t,n,a);
var u=e.recruit(i.command,e.contextFromChat(r,t,{expectedRevision:Number(i.expectedRevision),requestKey:i.requestKey}
));
W(r,X(i.command.type),u);
return u;
}function Ne(r,t,n,a,u){var o=null;
var s=null;
var l=null;
if(r.action==="HELP")return m(u,Ke());
if(r.action==="MISSING_NUMBER")return m(u,["[K-LOL.GG 양식 확인 필요]","모집번호를 찾지 못했습니다.","봇이 출력한 원본 양식의 ‘모집번호: #번호’를 유지해서 다시 보내 주세요."].join("\n"));
o=ae(n,a);
if(r.action==="STATUS")return m(u,I(o));
if(r.action==="DETAIL"){s=ie(o,r.recruitNo);
if(!s)throw f("진행 중인 파티 #"+r.recruitNo+"을 찾지 못했습니다.");
return m(u,le(s));
}
if(r.action==="CREATE"){var c=r.explicitRecruitNumber||Number(o.body.nextPartyRecruitNumber||0);
if(!c)throw f("오늘 모집 번호 99개를 모두 사용했습니다. 관리자에게 번호 초기화를 요청해 주세요.");
if(ie(o,c)&&!te(n,a,t))throw f("이미 진행 중인 파티 #"+c+"이 있습니다.");
l=he(n,a,t,(function(){return{expectedRevision:0,command:{type:"CREATE_PARTY",aggregateId:e.newUuid(),payload:{recruitDate:d(),resetSequence:Number(o.body.nextPartyResetSequence||0),recruitNumber:c,partyType:r.type,title:r.title,maximumMembers:Number(r.maximumMembers),members:[],startTimeText:null,gameInfo:null,scheduledStartAt:null,protectedUntil:null}}
};
}
));
if(!l||!l.ok)return m(u,p(l));
var v=l.body&&l.body.data?Number(l.body.data.recruitNumber||c):c;
return m(u,E(r,v,l.body&&l.body.data));
}if(r.action==="SYNC_FORM"){s=ie(o,r.recruitNo);
var g=oe(r);
var h=0;
var N=0;
for(N=0;
N<g.length;
N+=1)if(!g[N].substitute)h+=1;
if(h>Number(s?s.maximumMembers:r.maximumMembers))throw f("참가 인원이 모집 정원을 넘었습니다. 예비 인원은 정원과 별도로 최대 99명까지 보존됩니다.");
l=he(n,a,t,(function(){if(s)return{expectedRevision:Number(s.revision),command:{type:"SYNC_PARTY",aggregateId:s.id,payload:{members:g,startTimeText:r.startTimeText,gameInfo:r.gameInfo,scheduledStartAt:se(d(),r.startTimeText)}
}}
;
return{expectedRevision:0,command:{type:"CREATE_PARTY",aggregateId:e.newUuid(),payload:{recruitDate:d(),resetSequence:Number(o.body.nextPartyResetSequence||0),recruitNumber:Number(r.recruitNo),partyType:r.type,title:r.title,maximumMembers:Number(r.maximumMembers),members:g,startTimeText:r.startTimeText,gameInfo:r.gameInfo,scheduledStartAt:se(d(),r.startTimeText),protectedUntil:null}}
};
}
));
if(!l||!l.ok)return m(u,p(l));
o=ae(n,a);
s=ie(o,r.recruitNo);
return m(u,s?"[파티 #"+Number(r.recruitNo)+" 반영]\n"+Number(s.memberCount||0)+"/"+Number(s.maximumMembers||0)+" · 예비 "+Number(s.reserveCount||0)+"명\n시작시간: "+A(s)+" · 게임정보: "+(i(s.gameInfo||s.note)||"미입력")+"\n마감: "+Number(r.recruitNo)+"ㅉ":"[K-LOL.GG 파티]\n명단을 반영했습니다.");
}if(r.action==="FINISH"){s=ie(o,r.recruitNo);
if(!s&&!te(n,a,t))throw f("진행 중인 파티 #"+r.recruitNo+"을 찾지 못했습니다.");
l=he(n,a,t,(function(){return{expectedRevision:Number(s.revision),command:{type:"FINISH_PARTY",aggregateId:s.id,payload:{}
}}
;
}));
return m(u,l&&l.ok?"[K-LOL.GG 파티 #"+r.recruitNo+"]\n모집을 마감했습니다.":p(l));
}
return!1;
}function Se(e){var r=e.mode==="ARAM"?"칼바람":e.mode==="AUGMENT_ARAM"?"증바람":"협곡";
var t=e.dateKey||d();
var n=Number(e.recruitNo||1);
var a=Number(e.capacity||10);
var i=["📢 내전하실분 #"+n," 》"+r," 》"+t+" "+String(e.time||"21:00")+" 시작","👥 0/"+a+"명","","*참가 신청 양식*"];
var u=0;
if(e.mode==="RIFT"){i.push("이름/현티어/최고티어/주라인/부라인");
i.push("EX) 1.지후/P/E/AD/MD");
}
else{i.push("이름");
i.push("EX) 1.지후");
}i.push("");
for(u=1;
u<=a;
u+=1)i.push(u+".");
return i.join("\n");
}
function Te(){return["[K-LOL.GG 내전 종목 선택]","지원하지 않는 종목입니다: 양식","✅️협곡내전은 관리자에게 신청 후 안내에 따라 구인해주세요.✅️","","아래 명령어 중 하나를 입력해주세요.","- /내전구인 협곡","- /내전구인 칼바람","- /내전구인 증바람","","날짜·시간 지정: /내전구인 협곡 2026-08-06 21:00","모집번호·정원 지정: /내전구인 칼바람 #2 10명","","협곡은 티어·라인 양식으로 내전 명단에 등록됩니다.","칼바람·증바람은 이름만 모집하며 내전 명단에는 등록되지 않습니다."].join("\n");
}function ye(r,t,n,a){if(r.action==="JOIN")return m(a,we());
if(r.action==="CREATE"){if(r.templateRequest||r.invalidMode||!r.mode)return m(a,Te());
return m(a,Se(r));
}
if(r.action==="STATUS"||r.action==="DETAIL")return m(a,G(e.seasonApplications({action:"STATUS",seasonId:g(),applyDate:d(),recruitNo:r.recruitNo===null?null:Number(r.recruitNo)},e.contextFromChat(t,n))));
return!1;
}
function be(){return["[K-LOL.GG 스크림 구인 양식]","","운영일: "+d(),"번호: #자동배정","","일시: ","방식: 3판2선","","우리팀: ","TOP: ","JUG: ","MID: ","ADC: ","SUP: ","","상대팀: ","TOP: ","JUG: ","MID: ","ADC: ","SUP: "].join("\n");
}function Ae(r,t,n){var a=e.identityForChat(r,t);
return"KLOL_V41_V1_SCRIM_SYNC_"+a.roomId.substring(5)+"_"+a.senderId.substring(7)+"_"+w(o(n));
}
function Le(r,t,n,a,i){var u=ae(n,a);
var o=null;
var s=null;
if(r.action==="STATUS"){if(!r.scrimNo)return m(i,de(u));
o=ue(u,r.scrimNo);
if(!o)throw f("진행 중인 스크림 #"+r.scrimNo+"을 찾지 못했습니다.");
return m(i,ge(o));
}if(r.action==="UNSUPPORTED"){if(r.unsupportedKind==="JOIN")return m(i,"[K-LOL.GG 스크림 참가 명령 사용 안 함]\n스크림 양식에 직접 입력해주세요.");
if(r.unsupportedKind==="CONFIRM")return m(i,"[K-LOL.GG 스크림 확정 명령 사용 안 함]\n최신 스크림 양식을 다시 보내주세요.");
if(r.unsupportedKind==="CANCEL")return m(i,"[K-LOL.GG 스크림 취소 명령 사용 안 함]\n스크림은 오전 6시에 자동 종료됩니다.");
return m(i,"[K-LOL.GG 스크림 수동 종료 사용 안 함]\n스크림은 매일 오전 6시에 자동 종료됩니다.");
}
if(r.action==="DETAIL"){o=ue(u,r.scrimNo);
if(!o)throw f("진행 중인 스크림 #"+r.scrimNo+"을 찾지 못했습니다.");
return m(i,ge(o));
}if(r.action==="CREATE"&&r.templateRequest)return m(i,be());
if(r.action==="CREATE"){var l=Ae(n,a,t);
if(String(DataBase.getDataBase(l)||"")==="done")return!0;
var c=Number(r.scrimNo||u.body.nextScrimNumber||0);
var v=r.operationDate||d();
if(!c)throw f("오늘 스크림 번호 99개를 모두 사용했습니다.");
if(!r.requesterTeamName)throw f("우리팀 항목에 팀 이름을 적어 주세요. 예: 우리팀: 별빛단");
o=ue(u,c);
var g=o&&o.tournamentId?String(o.tournamentId):null;
var h=r.tournamentNo?Number(r.tournamentNo):o&&o.legacyTournamentNumber?Number(o.legacyTournamentNumber):null;
s=he(n,a,t,(function(){return{expectedRevision:o?Number(o.revision):0,command:{type:o?"SYNC_SCRIM":"CREATE_SCRIM",aggregateId:o?String(o.id):e.newUuid(),payload:{recruitDate:v,scrimNumber:c,tournamentId:g,legacyTournamentNumber:h,requesterTeamId:null,title:r.requesterTeamName+" 스크림 구인",requesterTeamName:r.requesterTeamName,opponentTeamName:r.opponentTeamName||null,requesterLineup:r.requesterLineup||null,opponentLineup:r.opponentLineup||null,memo:r.memo||null,seriesRuleText:r.seriesRuleText||null,scheduledAt:se(v,r.startTimeText),bestOf:Number(r.gameCount||3)}
}}
;
}));
if(!s||!s.ok)return m(i,p(s));
DataBase.setDataBase(l,"done");
u=ae(n,a);
o=ue(u,c);
if(s.body&&s.body.commandType==="CREATE_SCRIM")return m(i,"[K-LOL.GG 스크림 등록 완료]");
if(o)return m(i,"[스크림 #"+c+" 반영]\n상태: "+ce(o.status)+"\n\n"+ve(o).join("\n"));
return m(i,"[스크림 #"+c+" 반영]");
}
return!1;
}function Oe(r,t,n,a){var i=ee().classifyMessage(r,n,d());
if(!i)return!1;
if(i.domain==="INPUT"&&i.action==="REJECT")throw f("메시지가 너무 길거나 사용할 수 없는 제어문자가 포함되어 있습니다.");
if(i.domain==="PARTY")return Ne(i,r,t,n,a);
if(i.domain==="INHOUSE")return ye(i,t,n,a);
if(i.domain==="SCRIM")return Le(i,r,t,n,a);
if(i.domain==="OPERATION_FORM"&&i.action==="SUBMIT"){var u=ne(t,n,r,(function(){return{}
;
}));
var o=e.operationForm(i.formType,i.payload,e.contextFromChat(t,n,{requestKey:u.requestKey}
));
return m(a,o&&o.ok?o.body&&typeof o.body.reply=="string"?String(o.body.reply):"[K-LOL.GG 운영 양식]\n"+i.formType+" 양식을 접수했습니다.":p(o));
}if(i.domain==="MANAGED"){if(i.action==="PHOTO_CANCEL"){Ee(t,n);
return m(a,"[K-LOL.GG 사진 접수]\n이 대화의 사진 세션을 취소했습니다.");
}
if(i.action==="REGISTRATION_HUB")return m(a,Pe());
if(i.action==="INHOUSE_RESULT")return m(a,"[K-LOL.GG 내전 결과 등록]\n로그인한 계정으로 결과와 사진을 제출해 주세요.\n"+c("/matches/submit"));
if(i.action==="INHOUSE_RESULT_STATUS")return m(a,"[K-LOL.GG 내전 결과 제출 현황]\n로그인한 본인의 제출 상태만 확인할 수 있습니다.\n"+c("/matches/submissions"));
if(i.action==="DISCIPLINE_CREATE")return m(a,"[K-LOL.GG 관리자 경고 등록]\n관리자 로그인과 2차 인증 후 등록해 주세요.\n"+c("/admin/discipline/new"));
if(i.action==="DISCIPLINE_EVIDENCE")return m(a,"[K-LOL.GG 경고 차감 사진 제출]\n로그인하면 본인의 진행 과제만 표시됩니다.\n"+c("/account/discipline"));
if(i.action==="DISCIPLINE_STATUS")return m(a,"[K-LOL.GG 내 경고 현황]\n내정보에서 경고 상태와 남은 사진 수를 확인해 주세요.\n"+c("/account/discipline"));
}return!1;
}
function Ie(r,t){var n=e.identityForChat(r,t);
return"KLOL_V41_IMAGE_SESSION_"+n.roomId.substring(5)+"_"+n.senderId.substring(7);
}function Re(e,r,t){if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t))throw new Error("사진 세션 ID를 확인해 주세요.");
DataBase.setDataBase(Ie(e,r),t+"|"+String((new Date).getTime()));
}
function Ee(e,r){try{DataBase.setDataBase(Ie(e,r),"");
}catch(e){}
}function Ce(e,r){var t=String(DataBase.getDataBase(Ie(e,r))||"").split("|");
var n=i(t[0]);
var u=Number(t[1]||0);
var o=(new Date).getTime()-u;
if(!u||o<0||o>a||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(n)){Ee(e,r);
return null;
}
return{sessionId:n,savedAt:u,remainingMs:a-o};
}
function De(e,r){var t=Ce(e,r);
return t?t.sessionId:"";
}function Ge(e){var r="";
try{if(e&&e.getImageBase64)r=String(e.getImageBase64()||"");
}
catch(e){}try{if(!r&&e&&e.getImage)r=String(e.getImage()||"");
}
catch(e){}try{if(!r&&e&&e.getImageBitmap){var t=e.getImageBitmap();
if(t){var n=new java.io.ByteArrayOutputStream;
t.compress(android.graphics.Bitmap.CompressFormat.JPEG,92,n);
r=String(android.util.Base64.encodeToString(n.toByteArray(),android.util.Base64.NO_WRAP)||"");
n.close();
}
}}
catch(e){r="";
}return r;
}
function xe(e){var r=i(o(e));
return r==="사진"||r==="[사진]"||r==="Photo"||r==="photo";
}function _e(e){if(!e||!e.ok)return p(e);
var r=e.body&&typeof e.body=="object"?e.body:{}
;
var t=Number(r.receivedImageCount||0);
var n=Number(r.expectedImageCount||0);
var a=["[K-LOL.GG 사진 접수]","사진을 안전하게 접수했습니다."];
if(n>0)a.push("진행: "+t+"/"+n);
if(r.completed===!0)a.push("필요한 사진 접수가 완료되었습니다.");
else if(n>t)a.push("남은 사진: "+(n-t)+"장");
return a.join("\n");
}function Me(r,t,n,a){var i=De(r,t);
if(!i)return!1;
var u="image/jpeg";
var o=String(n).match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/i);
var s=o?o[2]:String(n);
if(o)u=o[1].toLowerCase();
s=s.replace(/\s+/g,"");
var l=e.imageReceive({sessionId:i,base64Image:s,declaredContentType:u,declaredSha256Hex:e.sha256Base64BytesHex(s),originalFileName:null}
,e.contextFromChat(r,t,{timeoutMs:9e4}));
if(l&&l.body&&(l.body.completed===!0||l.body.sessionActive===!1)||l&&(l.status===404||l.status===410))Ee(r,t);
m(a,_e(l));
return!0;
}
function Pe(){return["[K-LOL.GG 쉬운 등록 센터]","처음 사용하셔도 괜찮아요. 필요한 항목의 링크를 누르면 됩니다.","▶ "+c("/start"),"","① 내전 결과 등록","경기 정보와 결과 사진 2~3장을 한 화면에서 제출합니다.","▶ "+c("/matches/submit"),"","② 주의·경고·벤 등록 (관리자)","대상 검색부터 사유·근거 사진 등록까지 한 화면에서 처리합니다.","▶ "+c("/admin/discipline/new"),"※ 관리자 로그인이 필요하며, 권한이 없으면 등록할 수 없습니다.","","③ 경고 차감 사진 제출","본인의 진행 과제를 선택하고 남은 사진을 한 번에 제출합니다.","▶ "+c("/discipline/evidence"),"※ 본인 계정 로그인이 필요합니다.","","등록과 사진 제출은 로그인한 본인 계정 기준으로 처리됩니다."].join("\n");
}function Ue(){return["[K-LOL.GG 구인도우미]","","현재 사용 중인 카카오톡 명령어 전체 설명은 아래 페이지에서 확인해주세요.","",c("/recruit-helper"),"","구인현황 바로가기:",c("/recruit")].join("\n");
}
function Ke(){return["[K-LOL.GG 구인 도움말]","","1. 파티","생성: 5인파티","현황: 구인현황","종료: 번호ㅉ","","2. 내전","생성: 내전구인","현황: 내전현황","매일 오전 6시 자동 종료","","3. 스크림","생성: 스크림구인","현황: 스크림현황","매일 오전 6시 자동 종료","","공통: 양식 복사 → 이름 추가·삭제 → 양식 전체 전송"].join("\n");
}function we(){return["[K-LOL.GG 내전 참가 방법 안내]","오늘 시즌내전에 참가 가능하신 분은 사이트에서 참가 신청 부탁드립니다.","","1. K-LOL.GG 접속",c(""),"2. 로그인","3. 시즌내전 참가하기 클릭","4. 주 포지션 / 부 포지션 선택","5. 참가 신청 완료","","참가 신청 기준으로 팀 밸런스가 진행됩니다.","신청하지 않은 인원은 팀 편성에서 누락될 수 있습니다."].join("\n");
}
function Fe(e){var r=i(e).replace(/\s+/g,"");
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
}function $e(){return["[K-LOL.GG 일반 도움말]","","LOL-K 기능","- 내전현황 : 현재 시즌내전 신청 현황","- 내전참가 / 참가신청 : 참가 방법 안내","- 전적 닉네임#태그 : 플레이어 전적 조회","- 최근 닉네임#태그 : 최근 경기 조회","- 랭킹 : 랭킹 조회","","운영 기능","- /등록 : 초보자용 등록 센터","- /내전등록 : 사이트에서 내전 결과·사진 한 번에 등록","- /경고등록 : 관리자 경고 등록 화면 열기","- /인증 : 로그인 후 내 경고 사진을 사이트에서 제출","- /경고현황 : 내정보의 경고 진행 상황 열기","- /결과현황 : 사이트의 내 미완료 결과 접수 열기","","구인구직 명령어는 구인도움말을 입력해주세요.","스크림구인은 /스크림구인, /스크림현황을 사용해주세요.","","참고","- 모든 명령어 앞에 /를 붙여도 사용할 수 있습니다.","- 예) /내전현황, /전적 닉네임#태그, /구인도움말"].join("\n");
}
function ke(){return["[K-LOL.GG V2 관리 도움말]","/V2연동확인 · /V2사진세션 <사이트 발급 UUID>","/사진상태 · /V2사진취소","/V2모집 · /V2시즌 · /V2양식"].join("\n");
}function response(r,n,a,u,o,l,c){var f=ee().canonicalCommandText(n);
var h="";
try{if(s(a))return null;
h=Ge(l);
if(h&&Me(r,a,h,o))return null;
if(xe(f)&&Ce(r,a))return m(o,"[K-LOL.GG 사진 접수]\n사진 원본을 읽지 못했습니다. 카카오톡의 사진을 파일이 아닌 일반 사진으로 다시 보내 주세요. 세션은 그대로 유지됩니다.");
if(f.indexOf("들어왔습니다")>=0)return m(o,"다시 오셨네요, 반가워요! 😊");
if(f.indexOf("나갔습니다")>=0||f.indexOf("초대되었습니다")>=0)return null;
if(!f)return null;
if(f==="봇버전")return m(o,"[K-LOL.GG 카카오봇]\n"+t);
if(f==="V2도움말")return m(o,ke());
if(f==="도움말"||f==="명령어")return m(o,$e());
var N=Fe(f);
if(N)return m(o,N);
if(/^\/?(?:V2)?연동확인$/i.test(f))try{var b=e.identityForChat(r,a);
return m(o,"[K-LOL.GG V2 연동 ID]\n방: "+b.roomId+"\n발신자: "+b.senderId);
}
catch(e){return m(o,"[K-LOL.GG V2 연동]\n연동 ID 생성에 실패했습니다. MessengerBot R 실행 로그를 확인해 주세요.");
}if(/^\/?사진상태$/.test(f)){var A=Ce(r,a);
if(!A)return m(o,"[K-LOL.GG 사진 접수]\n연결된 사진 세션이 없습니다. 사이트에서 세션을 발급한 뒤 /V2사진세션 UUID를 보내 주세요.");
return m(o,"[K-LOL.GG 사진 접수]\n사진 세션이 연결되어 있습니다. 약 "+Math.max(1,Math.ceil(A.remainingMs/6e4))+"분 남았습니다.\n취소: /사진취소");
}
if(/^\/?(?:사진취소|V2사진취소)$/.test(f)){Ee(r,a);
return m(o,"[K-LOL.GG 사진 접수]\n이 대화의 사진 세션을 취소했습니다.");
}if(/^\/?내전미리보기취소$/.test(f)){$(r,a);
return m(o,"[K-LOL.GG 내전 신청]\n저장된 미리보기를 취소했습니다. 사이트에는 반영하지 않았습니다.");
}
var L=f.match(/^\/?내전확인\s+([A-Za-z0-9]{4,16})$/);
if(L)return V(r,a,L[1],o);
if(/^\/?전적\s+/.test(f))return m(o,S(e.playerRecord(f.replace(/^\/?전적\s+/,""),e.contextFromChat(r,a))));
if(/^\/?최근\s+/.test(f))return m(o,S(e.recentMatches(f.replace(/^\/?최근\s+/,""),e.contextFromChat(r,a))));
if(/^\/?랭킹$/.test(f))return m(o,T(e.ranking(e.contextFromChat(r,a))));
if(J(f))return Y(f,r,a,o);
if(/K-LOL\.GG\s*내전\s*참가\s*신청|내전\s*(?:참가\s*)?신청|협곡\s*내전|참가\s*신청\s*양식/.test(f)&&/^\s*\d{1,2}\s*[.)]/m.test(f))return m(o,B(r,a,f));
if(Oe(f,r,a,o))return null;
var O=f.match(/^\/?(?:자동공지|공지생성)(?:\s+(12|15|18|20))?$/i);
if(O)return m(o,y(e.scheduledNotice(O[1]||null,e.contextFromChat(r,a))));
if(/^\/?(?:구인현황|스크림현황)$/.test(f))return m(o,R(e.openchatStatus(e.contextFromChat(r,a))));
if(/^\/?내전현황(?:\s*#?\d{1,3})?$/.test(f))return m(o,G(e.seasonApplications({action:"STATUS",seasonId:g(),applyDate:d(),recruitNo:v(f)},e.contextFromChat(r,a))));
if(f.indexOf("V2모집 ")===0)return Q(f,r,a,o);
if(f.indexOf("V2시즌 ")===0)return m(o,G(e.seasonApplications(q(f,"V2시즌"),e.contextFromChat(r,a))));
if(f.indexOf("V2양식 ")===0){var I=q(f,"V2양식");
return m(o,p(e.operationForm(I.formType,I.payload,e.contextFromChat(r,a))));
}
if(f.indexOf("V2사진세션 ")===0){Re(r,a,i(f.substring(6)));
return m(o,"[K-LOL.GG 사진 접수]\n30분 동안 이 대화의 다음 사진을 안전하게 접수합니다.");
}}
catch(e){var E=e&&e.v41UserSafe===!0?String(e.message||"입력 형식을 확인해 주세요."):"설정 또는 입력 형식을 확인해 주세요.";
m(o,E.indexOf("[K-LOL.GG 요청 실패]")===0?E:"[K-LOL.GG 요청 실패]\n"+E);
}}
response.__kakaoBotEntryPoint=!0;
