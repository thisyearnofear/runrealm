/**
 * RunRealm Mobile App
 * Entry point for the mobile application using shared core components
 */
import { AppRegistry } from 'react-native';
import { name as appName } from './app.json';
import RunRealmMobileApp from './src/MobileApp';

AppRegistry.registerComponent(appName, () => RunRealmMobileApp);