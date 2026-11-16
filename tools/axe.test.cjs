const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {Molang} = require('molang');
const root = path.resolve(__dirname, '..');
const model = path.join(root, '工程师酒狐');
const read = p => fs.readFileSync(path.join(model,p),'utf8');
const json = p => JSON.parse(read(p));
const script = read('functions/winefox_bc_update@player_update.molang').replace(/\/\/[^\n]*/g,'');
const lerp = read('functions/winefox_bc_lerp.molang').replace(/\/\/[^\n]*/g,'');
const controller = json('controller/better_combat.animation_controllers.json').animation_controllers['player.swing'];
const clips = json('animations/better_combat.animation.json').animations;
const axeAuthored = JSON.parse(fs.readFileSync(path.join(root,'authoring/better_combat_axe.keyframes.json'),'utf8')).animations;
const config = JSON.parse(fs.readFileSync(path.join(root,'authoring/better_combat_axe.json'),'utf8'));
const attackNames = {right:'one_handed_slash_horizontal_right',left:'one_handed_slash_horizontal_left',stab:'one_handed_stab'};
const actionClips = ['','winefox_bc_right','winefox_bc_left','winefox_bc_stab','winefox_bc_axe_right','winefox_bc_axe_left','winefox_bc_axe_right_item','winefox_bc_axe_left_item'];
const actionStates = ['ysm-builtin','right','left','stab','axe_right','axe_left','axe_item_right','axe_item_left'];
function fixture() {
  const s={name:'',sword:false,axe:true,modelAxe:true,arm:0,swinging:true,tick:0,speed:1,dt:0,now:0};
  const vm = new Molang({query:{life_time:()=>s.now},ctrl:{hold:(hand,kind)=>kind===':sword'?s.sword:kind===':axe'?s.axe:(kind==='minecraft:diamond_axe'||kind==='minecraft:netherite_axe')?s.axe&&s.modelAxe:false,bcombat_attack_animation:()=>s.name},
    ysm:{swinging_arm:()=>s.arm,swinging:()=>s.swinging,swing_time:()=>s.tick,attack_speed:()=>s.speed,time_delta:()=>s.dt},
    fn:{winefox_bc_lerp:(...args)=>new Molang().execute(lerp.replace(/args\[(\d)\]/g,(_,i)=>String(args[+i])))}});
  vm.execute('v.winefox_bc_action=0;v.winefox_bc_input=0;v.winefox_bc_phase=0;v.winefox_bc_start=0;v.winefox_bc_speed=0;v.winefox_bc_last_swing=0;v.winefox_bc_blend=1;v.winefox_bc_combo=0;v.winefox_bc_recover_at=0;');
  vm.execute('v.winefox_bc_axe_stage=0;v.winefox_bc_axe_path=0;v.winefox_bc_axe_path_start=0;v.winefox_bc_axe_path_target=0;v.winefox_bc_axe_core_phase=0;v.winefox_bc_axe_capture=0;v.winefox_bc_axe_blend=1;v.winefox_bc_axe_hit_delay=0;v.winefox_bc_axe_cooldown_seconds=0;');
  const cacheNames=new Set(script.match(/v\.winefox_bc_(?:from|pose)_[a-z0-9_]+|v\.winefox_bc_axe_(?:from|pose)_[a-z0-9_]+/g));
  for(const key of cacheNames)vm.execute(`${key}=0;`);
  let state=controller.initial_state;
  const f={s,vm,update(advance=true) {
    if(advance)s.now+=s.dt;
    vm.execute(script);
    for(const t of controller.states[state].transitions) {
      const [next,condition]=Object.entries(t)[0];
      if(vm.execute(condition)) {state=next;break;}
    }
    return state;
  }};
  return f;
}
function attack(f,action,quoted=false) {
  const name=action===3?attackNames.stab:(action===1||action===4||action===6)?attackNames.right:attackNames.left;
  f.s.modelAxe=action<6;
  f.s.name=quoted?'"'+name+'"':name;
  f.s.tick=0;
  return f.update(false);
}
function value(f,name) { return f.vm.execute(name); }
function render(f) {
  const action=value(f,'v.winefox_bc_action');
  if(!action)return {};
  const result={};
  for(const [bone,channels] of Object.entries(clips[actionClips[action]].bones)) {
    for(const [channel,values] of Object.entries(channels)) {
      if(!['rotation','position'].includes(channel))continue;
      result[`${bone}/${channel}`]=values.map(v=>typeof v==='number'?v:f.vm.execute(v));
    }
  }
  return result;
}
function assertPoseNear(before,after,tolerance=1e-5) {
  assert.deepEqual(Object.keys(after),Object.keys(before));
  for(const key of Object.keys(before))for(let axis=0;axis<3;axis++){
    const raw=before[key][axis]-after[key][axis],wrapped=key.endsWith('/rotation')?((raw%360)+540)%360-180:raw,difference=Math.abs(wrapped);
    assert.ok(difference<tolerance,`${key}/${axis}: ${before[key][axis]} / ${after[key][axis]}; difference=${difference}; tolerance=${tolerance}`);
  }
}

test('axe routing separates weapon and display path, including quoted names',()=>{
  for(const modelAxe of [true,false])for(const quoted of [false,true]) {
    const f=fixture();f.s.modelAxe=modelAxe;
    const base=modelAxe?4:6;
    assert.equal(attack(f,base,quoted),actionStates[base]);
    assert.equal(attack(f,base+1,quoted),actionStates[base+1]);
  }
  const sword=fixture();sword.s.sword=true;sword.s.axe=false;sword.s.name=attackNames.right;assert.equal(sword.update(),'right');
  sword.s.axe=true;sword.s.sword=false;sword.s.modelAxe=true;sword.s.tick=1;sword.update(false);sword.s.tick=0;
  assert.equal(attack(sword,4),'axe_right');
  assert.equal(value(sword,'v.winefox_bc_combo'),0);
});

test('axe stab, unknown attacks, mining-like empty input, pickaxe and offhand fall back',()=>{
  for(const change of [{name:attackNames.stab},{name:'two_handed_spin'},{name:''},{axe:false,sword:false,name:attackNames.right},{arm:1,name:attackNames.right}]) {
    const f=fixture();Object.assign(f.s,change);assert.equal(f.update(),'ysm-builtin');
  }
});

test('axe upswing is independently locked using configured tick rounding',()=>{
  for(const [speed,ticks] of [[.8,4],[.9,3],[1,3],[1.6,2],[3.2,1],[20,1]]) {
    const f=fixture();f.s.speed=speed;attack(f,4);
    const expected=Math.max(1,Math.round(Math.max(2,20/speed)*config.timing.upswing*config.timing.upswing_multiplier))/20;
    assert.equal(ticks,Math.round(expected*20));
    assert.ok(Math.abs(value(f,'v.winefox_bc_axe_hit_delay')-expected)<1e-8);
    f.s.speed=speed*4;f.update(false);
    assert.ok(Math.abs(value(f,'v.winefox_bc_axe_hit_delay')-expected)<1e-8,'windup changed after attack start');
    f.s.now=value(f,'v.winefox_bc_axe_hit_at');f.update(false);
    assert.equal(value(f,'v.winefox_bc_axe_path'),1);
    const phase=value(f,'v.winefox_bc_phase'),path=value(f,'v.winefox_bc_axe_path');f.update(false);
    assert.equal(value(f,'v.winefox_bc_phase'),phase);assert.equal(value(f,'v.winefox_bc_axe_path'),path);
  }
});

test('single axe hit holds, releases left first, then returns both arms',()=>{
  const f=fixture();attack(f,4);
  f.s.now=.25;f.s.tick=1;f.update(false);render(f);
  assert.equal(value(f,'v.winefox_bc_axe_stage'),2);
  f.s.name='';f.s.swinging=false;f.update(false);
  const recoverAt=value(f,'v.winefox_bc_recover_at');
  assert.ok(recoverAt>=f.s.now+.16);
  f.s.now=recoverAt-.001;f.update(false);assert.equal(value(f,'v.winefox_bc_axe_stage'),2);
  const before=render(f);
  f.s.now=recoverAt;f.update(false);assert.equal(value(f,'v.winefox_bc_axe_stage'),3);
  assertPoseNear(before,render(f),.0002);
  const releaseStart=render(f);
  f.s.now=recoverAt+.1;f.update(false);const releasing=render(f);
  for(const bone of ['RightArm','RightForeArm','RightHand','UpperBody'])for(let axis=0;axis<3;axis++)assert.ok(Math.abs(releaseStart[`${bone}/rotation`][axis]-releasing[`${bone}/rotation`][axis])<1e-5,bone);
  assert.ok(Math.abs(releaseStart['LeftArm/rotation'][0]-releasing['LeftArm/rotation'][0])>.01);
  f.s.now=recoverAt+.3;f.update(false);const returning=render(f);
  assert.ok(Math.abs(returning['RightArm/rotation'][0]-releaseStart['RightArm/rotation'][0])>.01);
  f.s.now=recoverAt+.76;f.update(false);assert.equal(f.update(false),'ysm-builtin');
});

test('gripped axe combos retime shared path without idle, release or pose blending',()=>{
  for(const previous of [4,5])for(const next of [4,5])for(const gap of [false,true])for(const speed of [.8,1.6]) {
    const f=fixture();f.s.speed=speed;attack(f,previous);
    f.s.now=value(f,'v.winefox_bc_axe_hit_at')+.06;f.s.tick=5;f.update(false);render(f);
    if(gap){f.s.name='';f.s.swinging=false;f.s.now+=.03;f.update(false);assert.equal(value(f,'v.winefox_bc_axe_stage'),2);}
    const before=render(f),path=value(f,'v.winefox_bc_axe_path');
    f.s.now+=.04;f.s.swinging=true;f.s.tick=0;attack(f,next);
    assert.equal(value(f,'v.winefox_bc_axe_stage'),2);
    assert.equal(value(f,'v.winefox_bc_axe_path'),path);
    assert.equal(value(f,'v.winefox_bc_axe_blend'),1);
    assertPoseNear(before,render(f),.0002);
    f.update(false);assert.equal(value(f,'v.winefox_bc_axe_path'),path);
    f.s.now=value(f,'v.winefox_bc_axe_hit_at');f.update(false);
    const target=value(f,'v.winefox_bc_axe_path_target');
    assert.equal(target%2,(next===4)?1:0);
    assert.equal(value(f,'v.winefox_bc_axe_path'),target);
  }
});

test('mid-swing and post-release interruptions take over without a grip teleport',()=>{
  const f=fixture();f.s.speed=1;attack(f,4);
  f.s.now=.08;f.s.tick=5;f.update(false);assert.equal(value(f,'v.winefox_bc_axe_stage'),2);
  const mid=render(f),path=value(f,'v.winefox_bc_axe_path');f.s.tick=0;attack(f,5);
  assert.equal(value(f,'v.winefox_bc_axe_stage'),2);assert.equal(value(f,'v.winefox_bc_axe_path'),path);assertPoseNear(mid,render(f));
  f.s.name='';f.s.swinging=false;f.s.now=.4;f.update(false);f.s.now=value(f,'v.winefox_bc_recover_at')+.3;f.update(false);assert.equal(value(f,'v.winefox_bc_axe_stage'),3);assert.equal(value(f,'v.winefox_bc_action'),5);assert.equal(value(f,'t.keep'),1);
  const released=render(f);f.s.tick=0;attack(f,4);
  assert.equal(value(f,'v.winefox_bc_axe_stage'),1);assert.equal(value(f,'v.winefox_bc_axe_blend'),0,`capture=${value(f,'v.winefox_bc_axe_capture')} elapsed=${value(f,'t.elapsed')} now=${f.s.now} start=${value(f,'v.winefox_bc_start')} action=${value(f,'v.winefox_bc_action')}`);assertPoseNear(released,render(f));
  f.s.now=value(f,'v.winefox_bc_axe_grip_at');f.update(false);assert.equal(value(f,'v.winefox_bc_axe_stage'),2);
});

test('axe display channels select exactly one weapon and never rotate its handle',()=>{
  for(const action of [4,5,6,7]) {
    const f=fixture();f.vm.execute(`v.winefox_bc_action=${action};v.winefox_bc_axe_stage=2;`);
    const clip=clips[actionClips[action]],item=action>=6;
    assert.deepEqual(clip.bones.RightHandLocator.scale,Array(3).fill(item?1:0));
    assert.deepEqual(clip.bones.Rightfutou.scale,Array(3).fill(item?0:1));
    assert.deepEqual(clip.bones.Rightjiantihuan.scale,[0,0,0]);
    assert.ok(clip.bones.Rightfutou.rotation.every(v=>f.vm.execute(v)===0));
  }
});

test('all axe authoring clips own only real upper-body bones and no arm scale channels',()=>{
  const bones=new Set(json('models/main.json')['minecraft:geometry'][0].bones.map(b=>b.name));
  for(const [name,clip] of Object.entries(axeAuthored))for(const [bone,channels] of Object.entries(clip.bones)) {
    assert.ok(bones.has(bone),`${name}/${bone}`);assert.notEqual(bone,'LeftHand');
    assert.ok(!['GuiRoot','MRoot','Root','MAllbody','AllBody','DownBody'].includes(bone));
    if(/^(Left|Right)(Arm|ForeArm|Hand)$/.test(bone))assert.ok(!('scale' in channels),`${bone} scale`);
  }
});

const I=[[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]];
function multiply(a,b) {return a.map((row,r)=>row.map((_,c)=>a[r][0]*b[0][c]+a[r][1]*b[1][c]+a[r][2]*b[2][c]+a[r][3]*b[3][c]));}
function translation(v) {return [[1,0,0,v[0]],[0,1,0,v[1]],[0,0,1,v[2]],[0,0,0,1]];}
function rotation(v) {
  const [x,y,z]=v.map(a=>a*Math.PI/180),cx=Math.cos(x),sx=Math.sin(x),cy=Math.cos(y),sy=Math.sin(y),cz=Math.cos(z),sz=Math.sin(z);
  const X=[[1,0,0,0],[0,cx,-sx,0],[0,sx,cx,0],[0,0,0,1]],Y=[[cy,0,sy,0],[0,1,0,0],[-sy,0,cy,0],[0,0,0,1]],Z=[[cz,-sz,0,0],[sz,cz,0,0],[0,0,1,0],[0,0,0,1]];
  return multiply(Z,multiply(Y,X));
}
function point(m,v) {return [m[0][0]*v[0]+m[0][1]*v[1]+m[0][2]*v[2]+m[0][3],m[1][0]*v[0]+m[1][1]*v[1]+m[1][2]*v[2]+m[1][3],m[2][0]*v[0]+m[2][1]*v[1]+m[2][2]*v[2]+m[2][3]];}
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const geometry=json('models/main.json')['minecraft:geometry'][0].bones;
const byName=new Map(geometry.map(b=>[b.name,b]));
function fk(pose) {
  const worlds=new Map();
  function visit(name) {
    if(worlds.has(name))return worlds.get(name);
    const bone=byName.get(name),parent=bone.parent?visit(bone.parent):I;
    const pivot=bone.pivot.map((v,i)=>i===0?-v:v),rawParentPivot=bone.parent?byName.get(bone.parent).pivot:[0,0,0];
    const parentPivot=rawParentPivot.map((v,i)=>i===0?-v:v);
    const bedrockPosition=pose[`${name}/position`]||[0,0,0],bedrockRotation=pose[`${name}/rotation`]||[0,0,0];
    const p=[-bedrockPosition[0],bedrockPosition[1],bedrockPosition[2]],r=[-bedrockRotation[0],-bedrockRotation[1],bedrockRotation[2]];
    const relative=pivot.map((v,i)=>v-parentPivot[i]+p[i]);
    const rest=bone.rotation||[0,0,0];
    const local=multiply(translation(relative),rotation(rest.map((v,i)=>v+r[i])));
    const world=multiply(parent,local);worlds.set(name,world);return world;
  }
  for(const name of ['RightHand','Rightfutou','LeftArm','LeftForeArm'])visit(name);
  return worlds;
}
function corePose(f,action,q) {
  f.vm.execute(`v.winefox_bc_action=${action};v.winefox_bc_axe_stage=2;v.winefox_bc_axe_core_phase=${(q%2)/2};`);
  return render(f);
}
test('generated runtime curves keep the left fist on the second grip between keys',t=>{
  const f=fixture(),leftOffset=[-3.525-(-3.35325),16.275-23.58739,.05-(-.05)];
  let max=0,sum=0,count=0,minElbow=180,maxPalmStep=0,previousNormal=null;
  for(let i=0;i<=720;i++) {
    const q=2*(i+.37)/721,worlds=fk(corePose(f,4,q));
    const grip=point(worlds.get('Rightfutou'),config.grip.left_grip_local_blockbench);
    const fist=point(worlds.get('LeftForeArm'),leftOffset),error=distance(grip,fist);
    max=Math.max(max,error);sum+=error;count++;
    const shoulder=point(worlds.get('LeftArm'),[0,0,0]),elbow=point(worlds.get('LeftForeArm'),[0,0,0]);
    const a=shoulder.map((v,j)=>v-elbow[j]),b=fist.map((v,j)=>v-elbow[j]);
    const angle=Math.acos(Math.max(-1,Math.min(1,(a[0]*b[0]+a[1]*b[1]+a[2]*b[2])/(Math.hypot(...a)*Math.hypot(...b)))))*180/Math.PI;
    minElbow=Math.min(minElbow,angle);
    const m=worlds.get('LeftForeArm'),normal=[m[0][2],m[1][2],m[2][2]];
    if(previousNormal)maxPalmStep=Math.max(maxPalmStep,Math.acos(Math.max(-1,Math.min(1,normal[0]*previousNormal[0]+normal[1]*previousNormal[1]+normal[2]*previousNormal[2])))*180/Math.PI);
    previousNormal=normal;
    const rightGrip=point(worlds.get('Rightfutou'),[0,1,0]),rightHand=point(worlds.get('RightHand'),[0,0,0]);
    assert.ok(distance(rightGrip,rightHand)<1e-6);
  }
  for(const action of [5,6,7])for(let i=0;i<80;i++) {
    const q=2*(i+.41)/80,worlds=fk(corePose(f,action,q));
    const error=distance(point(worlds.get('Rightfutou'),config.grip.left_grip_local_blockbench),point(worlds.get('LeftForeArm'),leftOffset));
    max=Math.max(max,error);sum+=error;count++;
  }
  t.diagnostic(`grip max=${max.toFixed(6)}, mean=${(sum/count).toFixed(6)} model units; min elbow=${minElbow.toFixed(3)} deg; max palm step=${maxPalmStep.toFixed(3)} deg`);
  assert.ok(max<=config.grip.max_position_error_model_units,`grip error ${max}`);
  assert.ok(minElbow>12,`elbow approached a singular straight pose: ${minElbow}`);
  assert.ok(maxPalmStep<12,`left palm flipped between samples: ${maxPalmStep}`);
});
