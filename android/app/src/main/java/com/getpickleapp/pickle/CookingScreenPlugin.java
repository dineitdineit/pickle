package com.getpickleapp.pickle;

import android.view.WindowManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "CookingScreen")
public class CookingScreenPlugin extends Plugin {
    private volatile boolean enabled = false;

    private void apply(boolean awake) {
        android.app.Activity activity = getActivity();
        if (activity == null) return;
        activity.runOnUiThread(() -> {
            if (activity.isDestroyed()) return;
            if (awake) activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
    }

    @PluginMethod
    public void setKeepAwake(PluginCall call) {
        enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        apply(enabled);
        call.resolve();
    }

    @Override
    protected void handleOnPause() { apply(false); }

    @Override
    protected void handleOnResume() { apply(enabled); }

    @Override
    protected void handleOnDestroy() { enabled = false; apply(false); }
}
