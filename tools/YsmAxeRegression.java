import java.lang.reflect.*;
import java.nio.file.*;
import java.util.*;
import com.google.gson.Gson;

/** Executes the shipped axe runtime through the actual YSM 2.6.5 parser/evaluator. */
public final class YsmAxeRegression {
    private static final String PACKAGE="com.elfmcys.yesstevemodel.";
    private static Class<?> type(String name)throws Exception{return Class.forName(PACKAGE+name);}
    @SuppressWarnings("unchecked") private static Map<String,Object> bindingMap(Object root)throws Exception{
        var field=Arrays.stream(root.getClass().getDeclaredFields()).filter(f->Map.class.isAssignableFrom(f.getType())).findFirst().orElseThrow();
        field.setAccessible(true);return (Map<String,Object>)field.get(root);
    }
    private static Object variables(Class<?> binding,Class<?> assignable,Map<String,Object> storage){
        return Proxy.newProxyInstance(binding.getClassLoader(),new Class<?>[]{binding},(proxy,method,args)->{
            String name=(String)args[0];
            return Proxy.newProxyInstance(assignable.getClassLoader(),new Class<?>[]{assignable},(p,m,a)->{
                if(m.getDeclaringClass()==Object.class)return m.getName().equals("toString")?name:m.getName().equals("hashCode")?System.identityHashCode(p):p==a[0];
                if(a.length==2){storage.put(name,a[1]);return null;}
                return storage.getOrDefault(name,0f);
            });
        });
    }
    private static final class Fixture {
        final Class<?> parserClass;
        final Object parser,evaluator;
        final Method parse,eval;
        final Map<String,Object> attacks=new HashMap<>(),clock=new HashMap<>(),scoped=new HashMap<>(),temporary=new HashMap<>();
        final Object parsed;
        @SuppressWarnings("unchecked") Fixture(String script,String animation,boolean axe,boolean modelAxe,int arm,float speed)throws Exception{
            Class<?> binding=type("O0OoOO0ooo0oOooo0oooO0o0");
            parserClass=type("O0O0oOOOOo00o0o00o0o00oO");
            Map<String,Object> input=new HashMap<>();
            input.put("ctrl",Proxy.newProxyInstance(binding.getClassLoader(),new Class<?>[]{binding},(p,m,a)->animation));
            input.put("ysm",Proxy.newProxyInstance(binding.getClassLoader(),new Class<?>[]{binding},(p,m,a)->switch((String)a[0]){
                case "swinging_arm"->(float)arm;case "swing_time"->0f;case "time_delta"->.05f;case "attack_speed"->speed;default->1f;
            }));
            parser=parserClass.getConstructor(Map.class).newInstance(input);
            var primary=Arrays.stream(parserClass.getDeclaredFields()).filter(f->f.getType().getSimpleName().equals("OoooO0O00Oo0ooO0o0O00000")).findFirst().orElseThrow();
            primary.setAccessible(true);var bindings=bindingMap(primary.get(parser));
            var scopedBinding=bindings.get("v");var sample=scopedBinding.getClass().getMethod("getProperty",String.class).invoke(scopedBinding,"probe");var assignable=sample.getClass().getInterfaces()[0];
            attacks.put("bcombat_attack_animation",animation);bindings.put("ctrl",variables(binding,assignable,attacks));
            clock.put("life_time",0f);Object query=variables(binding,assignable,clock);bindings.put("query",query);bindings.put("q",query);
            Object v=variables(binding,assignable,scoped),t=variables(binding,assignable,temporary);
            bindings.put("v",v);bindings.put("variable",v);bindings.put("t",t);bindings.put("temp",t);
            String adapted=script.replace("ctrl.hold('mainhand', ':sword')","0")
                .replace("ctrl.hold('mainhand', ':axe')",axe?"1":"0")
                .replace("ctrl.hold('mainhand', 'minecraft:diamond_axe')",axe&&modelAxe?"1":"0")
                .replace("ctrl.hold('mainhand', 'minecraft:netherite_axe')",axe&&modelAxe?"1":"0");
            parse=parserClass.getMethod("oOoo00O0o0oO0o0oO00OO0O0",String.class,boolean.class);
            parsed=parse.invoke(parser,adapted,true);
            var evaluatorClass=type("O00o00OOOo00OOOo0O0oOooo");evaluator=evaluatorClass.getMethod("oOoo00O0o0oO0o0oO00OO0O0").invoke(null);
            eval=type("o0oOo00o0oOOOOOo00o0O0oo").getMethod("evalUnsafe",evaluatorClass);
        }
        void run()throws Exception{eval.invoke(parsed,evaluator);}
        void at(double time)throws Exception{clock.put("life_time",(float)time);run();}
        void attack(String name)throws Exception{attacks.put("bcombat_attack_animation",name);run();}
        float value(String name){return ((Number)scoped.getOrDefault(name,0f)).floatValue();}
        float channel(String expression)throws Exception{return ((Number)eval.invoke(parse.invoke(parser,expression,false),evaluator)).floatValue();}
    }
    private static void require(boolean condition,String message){if(!condition)throw new AssertionError(message);}
    private static void near(float actual,float expected,float tolerance,String message){require(Math.abs(actual-expected)<=tolerance,message+": "+actual+" != "+expected);}
    private static final String RIGHT="one_handed_slash_horizontal_right",LEFT="one_handed_slash_horizontal_left";
    private static int route(String script,String name,boolean axe,boolean model,int arm)throws Exception{
        var f=new Fixture(script,name,axe,model,arm,1f);f.run();return (int)f.value("winefox_bc_action");
    }
    @SuppressWarnings("unchecked") private static void animationChannels(String script,String animationPath)throws Exception{
        var f=new Fixture(script,RIGHT,true,true,0,1f);f.run();
        Map<String,Object> root=new Gson().fromJson(Files.readString(Path.of(animationPath)),Map.class);
        var animations=(Map<String,Object>)root.get("animations");var clip=(Map<String,Object>)animations.get("winefox_bc_axe_right");
        var bones=(Map<String,Object>)clip.get("bones");var axe=(Map<String,Object>)bones.get("Rightfutou");var rotation=(List<Object>)axe.get("rotation");
        String expression=(String)rotation.get(0);
        f.scoped.put("winefox_bc_axe_stage",2f);f.scoped.put("winefox_bc_axe_from_rightfutou_rotation_0",37f);f.scoped.put("winefox_bc_axe_blend",0f);
        near(f.channel(expression),0f,.00001f,"Gripped core used a per-bone blend");
        near(f.value("winefox_bc_axe_pose_rightfutou_rotation_0"),0f,.00001f,"Gripped pose cache was not written");
        f.scoped.put("winefox_bc_axe_stage",1f);f.scoped.put("winefox_bc_phase",0f);f.scoped.put("winefox_bc_axe_blend",.25f);
        near(f.channel(expression),27.75f,.00001f,"Ungripped display-pose blend failed in native channel mode");
        near(f.value("winefox_bc_axe_pose_rightfutou_rotation_0"),27.75f,.00001f,"Ungripped pose cache failed in native channel mode");
    }
    public static void main(String[] args)throws Exception{
        String script=Files.readString(Path.of(args[0]));int routes=0;
        int[][] expectations={
            {4,route(script,RIGHT,true,true,0)},{5,route(script,LEFT,true,true,0)},
            {6,route(script,RIGHT,true,false,0)},{7,route(script,LEFT,true,false,0)},
            {4,route(script,"\""+RIGHT+"\"",true,true,0)},{5,route(script,"\""+LEFT+"\"",true,true,0)},
            {6,route(script,"\""+RIGHT+"\"",true,false,0)},{7,route(script,"\""+LEFT+"\"",true,false,0)}
        };
        for(int[] pair:expectations){require(pair[0]==pair[1],"Axe route mismatch");routes++;}
        require(route(script,"one_handed_stab",true,true,0)==0,"Axe stab must fall back");routes++;
        require(route(script,"two_handed_spin",true,true,0)==0,"Unknown axe attack must fall back");routes++;
        require(route(script,RIGHT,true,true,1)==0,"Offhand axe attack must fall back");routes++;
        require(route(script,RIGHT,false,false,0)==0,"Non-axe must fall back");routes++;
        require(route(script,"",true,true,0)==0,"Held axe without BC must not attack");routes++;
        for(float speed:new float[]{.8f,1f,1.6f,3.2f}){
            var f=new Fixture(script,RIGHT,true,true,0,speed);f.run();
            float expected=Math.max(1,Math.round(Math.max(2f,20f/speed)*.15f))/20f;
            near(f.value("winefox_bc_axe_hit_delay"),expected,.000001f,"Native axe upswing");
        }
        var single=new Fixture(script,RIGHT,true,true,0,1f);single.run();
        near(single.value("winefox_bc_axe_hit_delay"),.15f,.000001f,"20-tick cooldown must use 3-tick windup");
        single.at(.05);float phase=single.value("winefox_bc_phase");single.run();near(single.value("winefox_bc_phase"),phase,0f,"Duplicate native evaluation advanced enter");
        single.at(.15);near(single.value("winefox_bc_axe_path"),1f,.000001f,"Axe hit path");require(single.value("winefox_bc_axe_stage")==2f,"Axe did not grip");
        single.at(.23);near(single.value("winefox_bc_axe_path"),1.1834f,.00001f,"Axe hold path");
        single.attack("");single.at(.25);require(single.value("winefox_bc_axe_stage")==2f,"Empty input released immediately");
        single.at(1.12);require(single.value("winefox_bc_axe_stage")==3f,"Single axe did not start release");near(single.value("winefox_bc_phase"),.675f,.000001f,"Release landmark");
        single.at(1.22);near(single.value("winefox_bc_phase"),.7375f,.000001f,"Left release must precede right return");
        single.at(1.87);require(single.value("winefox_bc_action")==0f,"Axe recovery did not release controller");
        var combo=new Fixture(script,RIGHT,true,true,0,1f);combo.run();combo.at(.23);float before=combo.value("winefox_bc_axe_path");
        combo.at(.27);combo.attack(LEFT);require(combo.value("winefox_bc_axe_stage")==2f,"Combo entered idle or release");near(combo.value("winefox_bc_axe_path"),before,0f,"Combo jumped on its first frame");
        combo.run();near(combo.value("winefox_bc_axe_path"),before,0f,"Duplicate combo evaluation changed path");combo.at(.42);near(combo.value("winefox_bc_axe_path"),2f,.000001f,"Reverse slash target");
        var restart=new Fixture(script,RIGHT,true,true,0,1f);restart.run();restart.at(.25);restart.attack("");restart.at(.3);restart.at(1.3);
        require(restart.value("winefox_bc_axe_stage")==3f,"Restart fixture did not enter release");restart.at(1.35);restart.attack(RIGHT);
        require(restart.value("winefox_bc_axe_stage")==1f,"Released axe did not naturally regrip");near(restart.value("winefox_bc_axe_blend"),0f,0f,"Regrip did not start at displayed pose");
        animationChannels(script,args[1]);
        System.out.println("PASS: YSM 2.6.5 native axe routing ("+routes+" cases), tick windup, single/combo/restart and animation-channel policies");
    }
}
