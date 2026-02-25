package com.workschedule.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Bundle
import android.provider.ContactsContract
import android.util.Base64
import android.util.Log
import android.webkit.*
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private val TAG = "WorkSchedule"
    private val WEB_URL = "https://wk7007-wk.github.io/WorkSchedule/"
    private val FALLBACK_URL = "file:///android_asset/index.html"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        setupWebView()
        loadPage()
    }

    private fun setupWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            cacheMode = WebSettings.LOAD_DEFAULT
            allowFileAccess = true
            setSupportZoom(false)
        }

        webView.addJavascriptInterface(NativeBridge(), "NativeBridge")

        webView.webViewClient = object : WebViewClient() {
            override fun onReceivedError(
                view: WebView?, request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                super.onReceivedError(view, request, error)
                if (request?.isForMainFrame == true) {
                    Log.e(TAG, "WebView load error: ${error?.description}")
                    webView.loadUrl(FALLBACK_URL)
                }
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                Log.d(TAG, "Page loaded: $url")
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                consoleMessage?.let {
                    Log.d(TAG, "[JS] ${it.message()} (${it.sourceId()}:${it.lineNumber()})")
                }
                return true
            }
        }
    }

    private fun loadPage() {
        webView.loadUrl(WEB_URL)
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    private companion object {
        const val REQUEST_CONTACTS = 100
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQUEST_CONTACTS && grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            // Permission granted — JS will retry getContacts
            webView.evaluateJavascript("document.getElementById('contactImportBtn')?.click()", null)
        }
    }

    private fun readContacts(): String {
        val contacts = JSONArray()
        try {
            val cursor = contentResolver.query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                arrayOf(
                    ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                    ContactsContract.CommonDataKinds.Phone.NUMBER
                ),
                null, null,
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC"
            )
            val seen = mutableSetOf<String>()
            cursor?.use {
                while (it.moveToNext()) {
                    val name = it.getString(0) ?: continue
                    if (seen.contains(name)) continue
                    seen.add(name)
                    val phone = it.getString(1) ?: ""
                    val obj = JSONObject()
                    obj.put("name", name)
                    obj.put("phone", phone)
                    contacts.put(obj)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "readContacts error: ${e.message}")
        }
        return contacts.toString()
    }

    inner class NativeBridge {

        @JavascriptInterface
        fun getAppVersion(): String {
            return try {
                val pInfo = packageManager.getPackageInfo(packageName, 0)
                pInfo.versionName ?: "unknown"
            } catch (e: Exception) {
                "unknown"
            }
        }

        @JavascriptInterface
        fun getContacts(): String {
            // Check permission
            if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.READ_CONTACTS)
                != PackageManager.PERMISSION_GRANTED) {
                runOnUiThread {
                    ActivityCompat.requestPermissions(
                        this@MainActivity,
                        arrayOf(Manifest.permission.READ_CONTACTS),
                        REQUEST_CONTACTS
                    )
                }
                return "[]"
            }
            return readContacts()
        }

        @JavascriptInterface
        fun shareImage(base64: String) {
            try {
                val cleanBase64 = if (base64.contains(",")) {
                    base64.substringAfter(",")
                } else {
                    base64
                }
                val bytes = Base64.decode(cleanBase64, Base64.DEFAULT)
                val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)

                val file = File(cacheDir, "share_image_${System.currentTimeMillis()}.png")
                FileOutputStream(file).use { out ->
                    bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, out)
                }

                val uri = FileProvider.getUriForFile(
                    this@MainActivity,
                    "${packageName}.fileprovider",
                    file
                )

                val intent = Intent(Intent.ACTION_SEND).apply {
                    type = "image/png"
                    putExtra(Intent.EXTRA_STREAM, uri)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                startActivity(Intent.createChooser(intent, "이미지 공유"))
            } catch (e: Exception) {
                Log.e(TAG, "shareImage error: ${e.message}")
            }
        }

        @JavascriptInterface
        fun shareText(text: String) {
            try {
                val intent = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_TEXT, text)
                }
                startActivity(Intent.createChooser(intent, "텍스트 공유"))
            } catch (e: Exception) {
                Log.e(TAG, "shareText error: ${e.message}")
            }
        }

        @JavascriptInterface
        fun shareSchedule(imageBase64: String, icsContent: String) {
            try {
                val cleanBase64 = if (imageBase64.contains(",")) imageBase64.substringAfter(",") else imageBase64
                val imgBytes = Base64.decode(cleanBase64, Base64.DEFAULT)
                val bitmap = BitmapFactory.decodeByteArray(imgBytes, 0, imgBytes.size)
                val ts = System.currentTimeMillis()

                val imgFile = File(cacheDir, "schedule_$ts.png")
                FileOutputStream(imgFile).use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }

                val icsFile = File(cacheDir, "schedule_$ts.ics")
                icsFile.writeText(icsContent)

                val imgUri = FileProvider.getUriForFile(this@MainActivity, "${packageName}.fileprovider", imgFile)
                val icsUri = FileProvider.getUriForFile(this@MainActivity, "${packageName}.fileprovider", icsFile)

                val intent = Intent(Intent.ACTION_SEND_MULTIPLE).apply {
                    type = "*/*"
                    putParcelableArrayListExtra(Intent.EXTRA_STREAM, arrayListOf(imgUri, icsUri))
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                startActivity(Intent.createChooser(intent, "근무표 공유"))
            } catch (e: Exception) {
                Log.e(TAG, "shareSchedule error: ${e.message}")
            }
        }
    }
}
