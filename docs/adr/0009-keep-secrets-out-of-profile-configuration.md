# Keep secrets out of profile configuration

AI Radar will store editable non-sensitive Profile Configuration in its instance data and expose it through the protected configuration console, while Source Credentials and Model Runtime credentials are supplied only through the deployment environment. The console may report whether a secret is present but never reads or stores its value.
