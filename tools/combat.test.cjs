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
  const s={name:'',sword:true,arm:0,swinging:true,tick:0,speed:1.6,dt:0.05};
  const vm = new Molang({ctrl:{hold:()=>s.sword,bcombat_attack_animation:()=>s.name},
    ysm:{swinging_arm:()=>s.arm,swinging:()=>s.swinging,swing_time:()=>s.tick,attack_speed:()=>s.speed,time_delta:()=>s.dt},
    fn:{winefox_bc_lerp:(...args)=>new Molang().execute(lerp.replace(/args\[(\d)\]/g,(_,i)=>String(args[+i])))}});
  let state=controller.initial_state;
  return {s,vm,update() {
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
    f.s.name=names[n];
    assert.equal(f.update(),['ysm-builtin','right','left','stab'][n]);
    assert.equal(f.vm.execute('v.winefox_bc_phase'),0);
  }
});
test('unknown, absent, non-sword and offhand attacks restore the builtin controller',()=>{
  for(const change of [{name:''},{name:'two_handed_slam'},{sword:false},{arm:1}]){
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
test('all generated curves hit authored poses and interpolate without overshoot',()=>{
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
          const eased=raw?.lerp_mode==='catmullrom'?u*u*(3-2*u):u;
          const expected=a[axis]+(b[axis]-a[axis])*eased;
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
