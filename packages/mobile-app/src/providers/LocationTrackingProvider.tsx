/**
 * LocationTrackingProvider
 * Initializes TaskManager and location task at app level
 * Provides location tracking context to child components
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";

const LOCATION_TASK_NAME = "LOCATION_TASK_NAME";

interface LocationTrackingContextValue {
  isTaskManagerReady: boolean;
  isTaskDefined: boolean;
  locationTaskName: string;
}

const LocationTrackingContext = createContext<LocationTrackingContextValue>({
  isTaskManagerReady: false,
  isTaskDefined: false,
  locationTaskName: LOCATION_TASK_NAME,
});

export const useLocationTracking = () => useContext(LocationTrackingContext);

interface LocationTrackingProviderProps {
  children: ReactNode;
}

export const LocationTrackingProvider: React.FC<
  LocationTrackingProviderProps
> = ({ children }) => {
  const [isTaskManagerReady, setIsTaskManagerReady] = useState(false);
  const [isTaskDefined, setIsTaskDefined] = useState(false);

  useEffect(() => {
    const initializeTaskManager = async () => {
      try {
        // Check if TaskManager is available
        if (!TaskManager) {
          console.warn("LocationTrackingProvider: TaskManager not available");
          return;
        }

        // Check if task is already defined
        if (TaskManager.isTaskDefined(LOCATION_TASK_NAME)) {
          console.log(
            "LocationTrackingProvider: Location task already defined"
          );
          setIsTaskDefined(true);
          setIsTaskManagerReady(true);
          return;
        }

        // Define the location task
        TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
          if (error) {
            console.error(
              "LocationTrackingProvider: Location task error:",
              error
            );
            return;
          }

          if (data) {
            const { locations } = data as {
              locations: Location.LocationObject[];
            };
            if (locations && locations.length > 0) {
              const location = locations[0];
              console.log(
                "LocationTrackingProvider: Background location update:",
                location
              );
              // Emit event or update state here if needed
              // You can use EventBus or a callback system here
            }
          }
        });

        setIsTaskDefined(true);
        setIsTaskManagerReady(true);
        console.log(
          "LocationTrackingProvider: Location task defined successfully"
        );
      } catch (error) {
        console.error(
          "LocationTrackingProvider: Failed to initialize TaskManager:",
          error
        );
        setIsTaskManagerReady(false);
        setIsTaskDefined(false);
      }
    };

    initializeTaskManager();
  }, []);

  const value: LocationTrackingContextValue = {
    isTaskManagerReady,
    isTaskDefined,
    locationTaskName: LOCATION_TASK_NAME,
  };

  return (
    <LocationTrackingContext.Provider value={value}>
      {children}
    </LocationTrackingContext.Provider>
  );
};
