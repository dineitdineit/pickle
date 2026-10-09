# Pickle homepage AdSense setup

The right sidebar supports one 160 × 600 display ad on web homepages at least
1440 CSS pixels wide. It is omitted entirely without valid configuration.
No AdSense account, approval, revenue, or live ad serving is established by this change.

1. Create an account at https://adsense.google.com/start/ and add `getpickleapp.com`.
2. Complete the account's payment information. Share the actual site verification
   code/meta tag or ads.txt record with the developer for implementation; do not
   use placeholder publisher IDs or invented verification records.
3. Confirm the live privacy policy describes the actual Google advertising
   integration. Configure Google's consent management as required for the
   visitor regions served, including applicable EEA/UK/Switzerland requirements.
4. Request site review and wait until AdSense shows the site is ready.
5. Create a **160 × 600 display ad unit**. Copy its `data-ad-client` and
   `data-ad-slot` values. Keep Auto ads disabled if only the manual sidebar is wanted.
6. Add these build environment variables in the web hosting project:

```dotenv
VITE_ADSENSE_ENABLED=true
VITE_ADSENSE_CLIENT=YOUR_ACTUAL_CA_PUB_ID
VITE_ADSENSE_HOME_SLOT=YOUR_ACTUAL_AD_SLOT_ID
```

7. Publish the provided ads.txt record at `/ads.txt`, deploy the web build, and
   verify ad serving in AdSense. These Vite values are public identifiers.

The SDK loads only when the configured sidebar is visible on the production
web domain. It is excluded on mobile, narrow desktops, and Capacitor's local
app host. Native app monetization is a separate integration. There are no
mock ads or revenue estimates, no automatic refresh, and no click-tracking wrapper.

Reference: https://support.google.com/adsense/answer/7584263
