/**
 * Bridge utility for communicating with the native Android side.
 * Provides a promise-based interface for calling native methods.
 */
export function bridgePromise<T>(method: string, payload?: any): Promise<T> {
  return new Promise((resolve, reject) => {
    const callbackId = `bridge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    (window as any)[`__bridgeCallback_${callbackId}__`] = (result: any) => {
      // Clean up the callback
      delete (window as any)[`__bridgeCallback_${callbackId}__`];
      if (result?.error) {
        reject(new Error(result.error));
      } else {
        resolve(result?.data ?? result);
      }
    };

    // Call the native method
    try {
      (window as any).AndroidPump?.invokeMethod?.(method, { ...payload, callbackId });
    } catch (error) {
      // Clean up the callback in case of error
      delete (window as any)[`__bridgeCallback_${callbackId}__`];
      reject(error);
    }

    // Set a timeout to prevent hanging promises
    setTimeout(() => {
      // Clean up the callback if it still exists (timeout occurred)
      if ((window as any)[`__bridgeCallback_${callbackId}__`]) {
        delete (window as any)[`__bridgeCallback_${callbackId}__`];
        reject(new Error('Bridge timeout: No response from native side'));
      }
    }, 10000); // 10 second timeout
  });
}