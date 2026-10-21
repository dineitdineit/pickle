package com.getpickleapp.pickle;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CookingScreenPlugin.class);
        registerPlugin(AppearancePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
