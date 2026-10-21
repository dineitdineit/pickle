package com.getpickleapp.pickle;

import android.app.Activity;
import android.content.res.Configuration;
import android.graphics.Color;
import android.view.Window;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "Appearance")
public class AppearancePlugin extends Plugin {
    private boolean dark = false;

    private void apply() {
        Activity activity = getActivity();
        if (activity == null) return;
        activity.runOnUiThread(() -> {
            if (activity.isDestroyed()) return;
            Window window = activity.getWindow();
            window.getDecorView().setBackgroundColor(dark ? Color.rgb(31, 31, 31) : Color.WHITE);
            WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(window, window.getDecorView());
            bars.setAppearanceLightStatusBars(!dark);
            bars.setAppearanceLightNavigationBars(!dark);
        });
    }

    @PluginMethod
    public void setTheme(PluginCall call) {
        dark = Boolean.TRUE.equals(call.getBoolean("dark", false));
        apply();
        call.resolve();
    }

    @Override
    protected void handleOnResume() { apply(); }

    @Override
    protected void handleOnConfigurationChanged(Configuration config) { apply(); }
}
