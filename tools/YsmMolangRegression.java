import java.lang.reflect.*;
import java.nio.file.*;
import java.util.*;

/** Executes shipped routing through the actual YSM 2.6.5 parser/evaluator, without Minecraft. */
public final class YsmMolangRegression {
    private static final String PACKAGE = "com.elfmcys.yesstevemodel.";
    private static Class<?> type(String name) throws ClassNotFoundException { return Class.forName(PACKAGE + name); }
    // The map is the parser's own String/Object binding table; the release obfuscates generic reflection metadata.
    @SuppressWarnings("unchecked")
    private static Map<String,Object> bindingMap(Object root) throws ReflectiveOperationException {
        var field = Arrays.stream(root.getClass().getDeclaredFields()).filter(f -> Map.class.isAssignableFrom(f.getType())).findFirst().orElseThrow();
        field.setAccessible(true);
        return (Map<String,Object>)field.get(root);
    }
    private static Object variables(Class<?> binding, Class<?> assignable, Map<String,Object> storage) {
        return Proxy.newProxyInstance(binding.getClassLoader(), new Class<?>[]{binding}, (proxy, method, args) -> {
            String name = (String)args[0];
            return Proxy.newProxyInstance(assignable.getClassLoader(), new Class<?>[]{assignable}, (p, m, a) -> {
                if (m.getDeclaringClass() == Object.class) return m.getName().equals("toString") ? name : m.getName().equals("hashCode") ? System.identityHashCode(p) : p == a[0];
                if (a.length == 2) { storage.put(name, a[1]); return null; }
                return storage.getOrDefault(name, 0f);
            });
        });
    }
    private static void verify(String script, String animation, boolean sword, int arm, int expected) throws Exception {
        var binding = type("O0OoOO0ooo0oOooo0oooO0o0");
        var parserClass = type("O0O0oOOOOo00o0o00o0o00oO");
        Map<String,Object> input = new HashMap<>();
        input.put("ctrl", Proxy.newProxyInstance(binding.getClassLoader(), new Class<?>[]{binding}, (p,m,a) -> new String(animation)));
        input.put("ysm", Proxy.newProxyInstance(binding.getClassLoader(), new Class<?>[]{binding}, (p,m,a) -> switch ((String)a[0]) {
            case "swinging_arm" -> (float)arm;
            case "swing_time" -> 0f;
            case "time_delta" -> .05f;
            case "attack_speed" -> 1.6f;
            default -> 1f;
        }));
        var parser = parserClass.getConstructor(Map.class).newInstance(input);
        var primary = Arrays.stream(parserClass.getDeclaredFields()).filter(f -> f.getType().getSimpleName().equals("OoooO0O00Oo0ooO0o0O00000")).findFirst().orElseThrow();
        primary.setAccessible(true);
        var bindings = bindingMap(primary.get(parser));
        var scopedBinding = bindings.get("v");
        var sample = scopedBinding.getClass().getMethod("getProperty", String.class).invoke(scopedBinding, "probe");
        var assignable = sample.getClass().getInterfaces()[0];
        Map<String,Object> clock = new HashMap<>(); clock.put("life_time", 0f);
        Object query = variables(binding, assignable, clock);
        bindings.put("query", query); bindings.put("q", query);
        Map<String,Object> scoped = new HashMap<>(), temporary = new HashMap<>();
        Object v = variables(binding, assignable, scoped), t = variables(binding, assignable, temporary);
        bindings.put("v",v); bindings.put("variable",v); bindings.put("t",t); bindings.put("temp",t);
        // Only the item lookup is stubbed: the real held-item guard was checked in game.
        String guard = "ctrl.hold('mainhand', ':sword')";
        if (!script.contains(guard)) throw new AssertionError("Update the item-input adapter for this script");
        var parsed = parserClass.getMethod("oOoo00O0o0oO0o0oO00OO0O0",String.class,boolean.class).invoke(parser,script.replace(guard,sword?"1":"0"),true);
        var evaluatorClass = type("O00o00OOOo00OOOo0O0oOooo");
        var evaluator = evaluatorClass.getMethod("oOoo00O0o0oO0o0oO00OO0O0").invoke(null);
        var eval = type("o0oOo00o0oOOOOOo00o0O0oo").getMethod("evalUnsafe",evaluatorClass);
        eval.invoke(parsed,evaluator);
        int actual = ((Number)scoped.getOrDefault("winefox_bc_action",0f)).intValue();
        if (actual != expected) throw new AssertionError(animation + ": expected action " + expected + ", got " + actual);
        if (expected != 0) {
            clock.put("life_time", .05f);
            eval.invoke(parsed,evaluator);
            float phase = ((Number)scoped.get("winefox_bc_phase")).floatValue();
            if (Math.abs(phase-.08f) > .000001f) throw new AssertionError("Native phase did not advance: "+phase);
            eval.invoke(parsed,evaluator);
            if (Math.abs(((Number)scoped.get("winefox_bc_phase")).floatValue()-phase) > .000001f)
                throw new AssertionError("Duplicate evaluation advanced the phase");
            // Execute the actual helper in the native parser, including conditional return.
            String helper = Files.readString(Path.of(helperPath));
            for (int linear = 0; linear <= 1; linear++) {
                for (float u : new float[]{0f, .25f, .5f, .75f, 1f}) {
                    float[] values = {u, 0, 1, 10, 20, linear, 0, 40};
                    String expression = helper;
                    for (int i=0;i<values.length;i++) expression=expression.replace("args["+i+"]", Float.toString(values[i]));
                    var nativeHelper=parserClass.getMethod("oOoo00O0o0oO0o0oO00OO0O0",String.class,boolean.class).invoke(parser,expression,true);
                    float result=((Number)eval.invoke(nativeHelper,evaluator)).floatValue();
                    float expectedCurve=linear==1 ? 10+10*u : 5*u*u*u-5*u*u+10*u+10;
                    if(Math.abs(result-expectedCurve)> .00001f) throw new AssertionError("Native curve: "+result+" != "+expectedCurve);
                }
            }
        }
    }
    private static String helperPath;
    public static void main(String[] args) throws Exception {
        String script = Files.readString(Path.of(args[0]));
        helperPath = Path.of(args[0]).resolveSibling("winefox_bc_lerp.molang").toString();
        verify(script,"one_handed_slash_horizontal_right",true,0,1);
        verify(script,"one_handed_slash_horizontal_left",true,0,2);
        verify(script,"one_handed_stab",true,0,3);
        verify(script,"\"one_handed_slash_horizontal_right\"",true,0,1);
        verify(script,"\"one_handed_slash_horizontal_left\"",true,0,2);
        verify(script,"\"one_handed_stab\"",true,0,3);
        verify(script,"",true,0,0);
        verify(script,"unknown_attack",true,0,0);
        verify(script,"one_handed_stab",false,0,0);
        verify(script,"one_handed_stab",true,1,0);
        System.out.println("PASS: YSM 2.6.5 native routing, fallback, render clock and interpolation (10 routing cases)");
    }
}
