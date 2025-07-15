import json
import os
import tempfile
import subprocess
import shutil

from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join
import tornado
import uv

class RouteHandler(APIHandler):
    # The following decorator should be present on all verb methods (head, get, post,
    # patch, put, delete, options) to ensure only authorized user can request the
    # Jupyter server
    @tornado.web.authenticated
    def get(self):
        self.finish(json.dumps({
            "data": "This is /pep723widget/get-example endpoint!"
        }))


class AddDependencyHandler(APIHandler):
    @tornado.web.authenticated
    def post(self):
        """Add a dependency to PEP 723 script metadata using uv"""
        try:
            # Parse request body
            data = json.loads(self.request.body)
            script_metadata = data.get("script_metadata", "")
            dependency = data.get("dependency", "")
            
            if not script_metadata or not dependency:
                self.set_status(400)
                self.finish(json.dumps({
                    "error": "Both script_metadata and dependency are required"
                }))
                return
            
            # Validate dependency name (basic security check)
            if not self._is_valid_dependency_name(dependency):
                self.set_status(400)
                self.finish(json.dumps({
                    "error": "Invalid dependency name"
                }))
                return
            
            # Get uv executable
            try:
                uv_bin = uv.find_uv_bin()
            except Exception as e:
                self.set_status(500)
                self.finish(json.dumps({
                    "error": f"uv not available: {str(e)}"
                }))
                return
            
            # Create temporary directory
            temp_dir = tempfile.mkdtemp()
            temp_py_file = os.path.join(temp_dir, "script.py")
            
            try:
                # Write script metadata to temporary file
                with open(temp_py_file, 'w') as f:
                    f.write(script_metadata)
                
                # Run uv add command
                result = subprocess.run(
                    [uv_bin, "add", "--script", temp_py_file, dependency],
                    capture_output=True,
                    text=True,
                    cwd=temp_dir
                )
                
                if result.returncode != 0:
                    self.set_status(500)
                    self.finish(json.dumps({
                        "error": f"uv add failed: {result.stderr}"
                    }))
                    return
                
                # Read updated file
                with open(temp_py_file, 'r') as f:
                    updated_metadata = f.read()
                
                self.finish(json.dumps({
                    "updated_metadata": updated_metadata
                }))
                
            finally:
                # Clean up temporary directory
                shutil.rmtree(temp_dir, ignore_errors=True)
                
        except json.JSONDecodeError:
            self.set_status(400)
            self.finish(json.dumps({
                "error": "Invalid JSON in request body"
            }))
        except Exception as e:
            self.set_status(500)
            self.finish(json.dumps({
                "error": f"Internal server error: {str(e)}"
            }))
    
    def _is_valid_dependency_name(self, dependency):
        """Basic validation for dependency names to prevent command injection"""
        # Allow alphanumeric, hyphens, underscores, dots, brackets, and spaces for version specs
        import re
        pattern = r'^[a-zA-Z0-9\-_\.\[\]\s<>=!,]+$'
        return bool(re.match(pattern, dependency)) and len(dependency) <= 200


def setup_handlers(web_app):
    host_pattern = ".*$"

    base_url = web_app.settings["base_url"]
    
    # Existing handler
    route_pattern = url_path_join(base_url, "pep723widget", "get-example")
    
    # New add-dependency handler
    add_dependency_pattern = url_path_join(base_url, "pep723widget", "add-dependency")
    
    handlers = [
        (route_pattern, RouteHandler),
        (add_dependency_pattern, AddDependencyHandler)
    ]
    web_app.add_handlers(host_pattern, handlers)
