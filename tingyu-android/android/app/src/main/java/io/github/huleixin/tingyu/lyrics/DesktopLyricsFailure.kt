package io.github.huleixin.tingyu.lyrics

import com.getcapacitor.JSObject

// Record code locations, not exception messages which can contain URLs or user data.
internal fun desktopLyricsFailure(error: Throwable): JSObject = JSObject()
    .put("error", error.javaClass.simpleName)
    .put("cause", error.cause?.javaClass?.simpleName ?: "")
    .put("frames", error.stackTrace.take(8).joinToString("\n") { it.toString() })
