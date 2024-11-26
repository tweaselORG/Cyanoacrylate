/* eslint-disable no-console */
import { readdir } from 'fs/promises';
import path from 'path';
import { pause, startAnalysis } from '../src/index';

// You can pass the following command line arguments:
// `npx tsx examples/multiple-apps.ts <path to a folder of single APKs> <emulator name> <snapshot name> `

(async () => {
    const apkFolder = process.argv[2];
    // If you do not specify these, cyanoacrylate will just create and manage its own emulator, prefixed `cyanoacrylate-test-`.
    const emulatorName = process.argv[3];
    const snapshotName = process.argv[4];

    if (!apkFolder) throw Error('Please provide a folder of APKs as the first argument.');

    const analysis = await startAnalysis({
        platform: 'android',
        runTarget: 'emulator',
        capabilities: ['frida', 'certificate-pinning-bypass'],
        targetOptions:
            emulatorName && snapshotName
                ? {
                      snapshotName,
                      emulatorName,
                      managed: false,
                  }
                : {
                      managed: true,
                      infix: 'test',
                      attemptRebuilds: 0,
                      createEmulatorOptions: {
                          variant: 'google_apis',
                          architecture: 'x86_64',
                          apiLevel: 33,
                      },
                  },
    });

    // The library was designed to do this for many apps in one go,
    // so you can easily loop through an array of apps.
    const apks = await readdir(apkFolder);
    for (const apkFile of apks) {
        try {
            await analysis.ensureDevice();

            const appAnalysis = await analysis.startAppAnalysis(path.join(apkFolder, apkFile) as `${string}.apk`);

            await analysis.resetDevice();
            // await analysis.ensureTrackingDomainResolution();

            await appAnalysis.installApp();
            await appAnalysis.setAppPermissions();
            await appAnalysis.startTrafficCollection();
            await appAnalysis.startApp();

            // Pause to wait for the app to generate network traffic.
            await pause(6_000);

            await appAnalysis.stopTrafficCollection();

            const result = await appAnalysis.stop();

            console.dir(result, { depth: null });
            // {
            //    app: { id: '<app id>',  name: '<app name>', version: '<app version>', ... },
            //    traffic: { '2023-03-27T10:29:44.197Z': { log: ... } }  <- The traffic collections are named by a timestamp and contain the collected requests in the HAR format.
            // }
        } catch (error: any) {
            // Handle the error here, e.g. queue the app for analysis again etc.
            if (error.name === 'EmulatorError') console.error(error.message);
        }
    }

    await analysis.stop();
})();
/* eslint-enable no-console */
