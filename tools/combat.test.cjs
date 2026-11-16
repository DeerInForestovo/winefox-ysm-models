// Executes shipped expressions with an independent Molang interpreter, not YSM.
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
const authored = JSON.parse(fs.readFileSync(path.join(root,'authoring/better_combat.keyframes.json'),'utf8')).animations;
const names=['','one_handed_slash_horizontal_right','one_handed_slash_horizontal_left','one_handed_stab'];
function fixture() {
  const s={name:'',sword:true,arm:0,swinging:true,tick:0,speed:1.6,dt:0.05,now:0};
  const vm = new Molang({query:{life_time:()=>s.now},ctrl:{hold:()=>s.sword,bcombat_attack_animation:()=>s.name},
    ysm:{swinging_arm:()=>s.arm,swinging:()=>s.swinging,swing_time:()=>s.tick,attack_speed:()=>s.speed,time_delta:()=>s.dt},
    fn:{winefox_bc_lerp:(...args)=>new Molang().execute(lerp.replace(/args\[(\d)\]/g,(_,i)=>String(args[+i])))}});
  vm.execute('v.winefox_bc_action=0;v.winefox_bc_input=0;v.winefox_bc_phase=0;v.winefox_bc_start=0;v.winefox_bc_speed=0;v.winefox_bc_last_swing=0;');
  let state=controller.initial_state;
  return {s,vm,update(advance=true) {
    if(advance)s.now+=s.dt;
    vm.execute(script);
    for(const t of controller.states[state].transitions) {
      const [next,condition]=Object.entries(t)[0];
      if(vm.execute(condition)) {state=next;break;}
    }
    return state;
  }};
}
test('BC chooses the attack: combo, interrupted combo, direct stab and arbitrary order',()=>{
  const f=fixture();
  for(const n of [1,2,3,0,1,0,3,2,1,3,0]){
    if(n===0)f.s.now+=2;
    f.s.name=names[n];
    assert.equal(f.update(),['ysm-builtin','right','left','stab'][n]);
    assert.equal(f.vm.execute('v.winefox_bc_phase'),0);
  }
});
test('unknown, absent, non-sword and offhand attacks restore the builtin controller',()=>{
  assert.equal(fixture().update(),'ysm-builtin');
  for(const change of [{name:'two_handed_slam'},{sword:false},{arm:1}]){
    const f=fixture();f.s.name=names[3];assert.equal(f.update(),'stab');
    Object.assign(f.s,change);assert.equal(f.update(),'ysm-builtin');
  }
});
test('shared phase follows attack speed, resets on repeated same-name swing and clamps',()=>{
  for(const speed of [0.8,1.6,3.2]){
    const f=fixture();f.s.speed=speed;f.s.dt=1/(speed*10);f.s.name=names[3];f.update();
    for(let tick=1;tick<=5;tick++){f.s.tick=tick;f.update();}
    assert.ok(Math.abs(f.vm.execute('v.winefox_bc_phase')-.5)<1e-8);
    f.s.tick=0;assert.equal(f.update(),'stab');assert.equal(f.vm.execute('v.winefox_bc_phase'),0);
    for(let tick=1;tick<30;tick++){f.s.tick=tick;f.update();}
    assert.equal(f.vm.execute('v.winefox_bc_phase'),1);
  }
});
test('generated curves match four-point Catmull-Rom and linear authoring',()=>{
  const f=fixture();let samples=0;
  for(const [name,clip] of Object.entries(clips)){
    for(const [bone,channels] of Object.entries(authored[name].bones))for(const [channel,frames] of Object.entries(channels)){
      if(typeof frames!=='object'||Array.isArray(frames))continue;
      const points=Object.entries(frames).map(([t,v])=>[+t,v.post??v]).sort((a,b)=>a[0]-b[0]);
      for(let i=0;i<points.length-1;i++)for(const u of [0,.25,.5,.75,1]){
        const [t0,a]=points[i],[t1,b]=points[i+1],phase=t0+(t1-t0)*u;
        f.vm.execute(`v.winefox_bc_phase=${phase};`);
        for(let axis=0;axis<3;axis++){
          const raw=frames[Object.keys(frames).find(k=>+k===t0)];
          const next=frames[Object.keys(frames).find(k=>+k===t1)];
          const cubic=raw?.lerp_mode==='catmullrom'||next?.lerp_mode==='catmullrom';
          // Reference cubic Hermite basis (THREE.SplineCurve / Blockbench),
          // independent of the runtime helper's polynomial expansion.
          const p0=points[Math.max(0,i-1)][1][axis];
          const p3=points[Math.min(points.length-1,i+2)][1][axis];
          const expected=cubic?
            (2*u**3-3*u*u+1)*a[axis]+(u**3-2*u*u+u)*(b[axis]-p0)/2+
            (-2*u**3+3*u*u)*b[axis]+(u**3-u*u)*(p3-a[axis])/2:
            a[axis]+(b[axis]-a[axis])*u;
          const actual=f.vm.execute(clip.bones[bone][channel][axis]);
          assert.ok(Number.isFinite(actual)&&Math.abs(expected-actual)<1e-6,`${name}/${bone}/${channel}/${phase}/${axis}`);samples++;
        }
      }
    }
  }
  assert.ok(samples>1000);
});
test('runtime references exist, bones are real, and no unsupported animation clock is shipped',()=>{
  const bones=new Set(json('models/main.json')['minecraft:geometry'][0].bones.map(b=>b.name));
  for(const c of Object.values(clips)){
    assert.ok(!('anim_time_update' in c));
    for(const bone of Object.keys(c.bones))assert.ok(bones.has(bone),bone);
  }
  for(const state of Object.values(controller.states))for(const name of state.animations??[])assert.ok(clips[name]);
  const files=json('ysm.json').files.player;
  for(const file of [...Object.values(files.animation),...files.animation_controllers])assert.ok(fs.existsSync(path.join(model,file)),file);
});
test('approved thrust keeps idle endpoints and claims only upper-body bones',()=>{
  const geometry=json('models/main.json')['minecraft:geometry'][0].bones;
  const byName=new Map(geometry.map(b=>[b.name,b]));
  for(const [name,channels] of Object.entries(authored.winefox_bc_stab.bones)){
    let bone=byName.get(name),upper=false;
    while(bone){if(bone.name==='UpBody'){upper=true;break;}bone=byName.get(bone.parent);}
    assert.ok(upper,`Lower-body or root channel must not be claimed: ${name}`);
    for(const frames of Object.values(channels)){
      if(typeof frames!=='object'||Array.isArray(frames))continue;
      const points=Object.entries(frames).sort((a,b)=>+a[0]-+b[0]);
      assert.deepEqual(points[0][1],points.at(-1)[1],`Idle mismatch: ${name}`);
    }
  }
  assert.equal(authored.winefox_bc_stab.animation_length,1);
});

test('quoted Better Combat names select the same three exact actions',()=>{
  const f=fixture();
  for(let i=1;i<=3;i++){f.s.name='"'+names[i]+'"';assert.equal(f.update(),['','right','left','stab'][i]);}
});


test('render clock advances within a tick and is invariant to duplicate evaluations',()=>{
  for(const fps of [30,60,144]){
    const f=fixture();f.s.name=names[1];f.s.dt=0;f.update();
    for(let frame=1;frame<=Math.floor(fps/2);frame++){
      f.s.now=frame/fps;
      f.s.tick=Math.floor(f.s.now*20);
      f.update(false);
      const phase=f.vm.execute('v.winefox_bc_phase');
      assert.ok(Math.abs(phase-f.s.now*f.s.speed)<1e-8);
      f.update(false);
      assert.equal(f.vm.execute('v.winefox_bc_phase'),phase);
    }
  }
});

test('Catmull-Rom passes a moving middle key without a smoothstep stop',()=>{
  const f=fixture();
  const sample=u=>f.vm.execute(`fn.winefox_bc_lerp(${u},0,1,10,20,0,0,30)`);
  assert.ok(Math.abs((sample(1e-4)-sample(0))/1e-4-10)<1e-5);
  assert.ok(Math.abs((sample(1)-sample(1-1e-4))/1e-4-10)<1e-5);
});


test('empty attack input completes authored recovery before releasing the controller',()=>{
  for(const name of names.slice(1))for(const empty of ['', '\"\"']){
    const f=fixture();f.s.name=name;f.s.dt=0;f.update();
    f.s.now=.4/f.s.speed;f.s.tick=3;f.update(false);
    const state=f.update(false);
    f.s.name=empty;f.s.swinging=false;
    f.s.now=.7/f.s.speed;
    assert.equal(f.update(false),state);
    assert.ok(Math.abs(f.vm.execute('v.winefox_bc_phase')-.7)<1e-8);
    f.s.now=.95/f.s.speed;assert.equal(f.update(false),state);
    f.s.now=1.01/f.s.speed;assert.equal(f.update(false),'ysm-builtin');
  }
});

test('recovery yields immediately to a new attack, same-name restart or unsupported input',()=>{
  for(const next of [names[1],names[2],names[3],'unsupported']){
    const f=fixture();f.s.name=names[1];f.s.dt=0;f.update();
    f.s.now=.3;f.s.name='';f.s.swinging=false;f.update(false);
    f.s.now=.35;f.s.name=next;f.s.swinging=true;
    assert.equal(f.update(false),next==='unsupported'?'ysm-builtin':['','right','left','stab'][names.indexOf(next)]);
    assert.equal(f.vm.execute('v.winefox_bc_phase'),0);
  }
  for(const change of [{sword:false},{arm:1}]){
    const f=fixture();f.s.name=names[1];f.s.dt=0;f.update();
    f.s.now=.3;f.s.name='';f.update(false);Object.assign(f.s,change);
    assert.equal(f.update(false),'ysm-builtin');
  }
});
