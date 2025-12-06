@ECHO OFF

SETLOCAL

set DIRNAME=%~dp0
if "%DIRNAME%" == "" set DIRNAME=.
set APP_BASE_NAME=%~n0
set APP_HOME=%DIRNAME%

set DEFAULT_JVM_OPTS="-Xmx64m" "-Xms64m"

set CLASSPATH=%APP_HOME%\gradle\wrapper\gradle-wrapper.jar

IF EXIST "%JAVA_HOME%\bin\java.exe" (
    set JAVA_EXE=%JAVA_HOME%\bin\java.exe
) ELSE (
    set JAVA_EXE=java.exe
)

if exist "%JAVA_EXE%" goto execute

echo ERROR: JAVA_HOME is not set and no 'java' command could be found in your PATH.
goto fail

:execute
"%JAVA_EXE%" %DEFAULT_JVM_OPTS% %JAVA_OPTS% %GRADLE_OPTS% -classpath "%CLASSPATH%" org.gradle.wrapper.GradleWrapperMain %*
EXIT /B %ERRORLEVEL%

:fail
EXIT /B 1
