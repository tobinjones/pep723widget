import json
import os
import re
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


class GetTreeHandler(APIHandler):
    @tornado.web.authenticated
    def post(self):
        """Get dependency tree for PEP 723 script metadata using uv"""
        try:
            # Parse request body
            data = json.loads(self.request.body)
            script_metadata = data.get("script_metadata", "")
            lockfile_content = data.get("lockfile_content")  # Can be None/null
            
            if not script_metadata:
                self.set_status(400)
                self.finish(json.dumps({
                    "error": "script_metadata is required"
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
            temp_lock_file = os.path.join(temp_dir, "script.py.lock")
            
            try:
                # Step 1: Write script metadata to temporary file
                with open(temp_py_file, 'w') as f:
                    f.write(script_metadata)
                
                # Step 2: Handle lockfile
                if lockfile_content:
                    # Write provided lockfile content
                    with open(temp_lock_file, 'w') as f:
                        f.write(lockfile_content)
                else:
                    # Generate lockfile using uv lock
                    lock_result = subprocess.run(
                        [uv_bin, "lock", "--script", temp_py_file],
                        capture_output=True,
                        text=True,
                        cwd=temp_dir
                    )
                    
                    if lock_result.returncode != 0:
                        self.set_status(500)
                        self.finish(json.dumps({
                            "error": f"uv lock failed: {lock_result.stderr}"
                        }))
                        return
                
                # Step 3: Run uv tree command
                tree_result = subprocess.run(
                    [uv_bin, "tree", "--script", temp_py_file],
                    capture_output=True,
                    text=True,
                    cwd=temp_dir
                )
                
                tree_output = tree_result.stdout if tree_result.returncode == 0 else "Tree generation failed"
                
                # Step 4: Read lockfile
                updated_lockfile = None
                if os.path.exists(temp_lock_file):
                    with open(temp_lock_file, 'r') as f:
                        updated_lockfile = f.read()
                
                # Step 5: Return results
                self.finish(json.dumps({
                    "tree_output": tree_output,
                    "lockfile_content": updated_lockfile
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


class InitializeHandler(APIHandler):
    @tornado.web.authenticated
    def post(self):
        """Initialize PEP 723 script metadata using uv init and uv lock"""
        try:
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
            temp_lock_file = os.path.join(temp_dir, "script.py.lock")
            
            try:
                # Step 1: Run uv init --script to create basic metadata
                init_result = subprocess.run(
                    [uv_bin, "init", "--script", temp_py_file],
                    capture_output=True,
                    text=True,
                    cwd=temp_dir
                )
                
                if init_result.returncode != 0:
                    self.set_status(500)
                    self.finish(json.dumps({
                        "error": f"uv init failed: {init_result.stderr}"
                    }))
                    return
                
                # Step 2: Run uv lock --script to generate lockfile
                lock_result = subprocess.run(
                    [uv_bin, "lock", "--script", temp_py_file],
                    capture_output=True,
                    text=True,
                    cwd=temp_dir
                )
                
                if lock_result.returncode != 0:
                    self.set_status(500)
                    self.finish(json.dumps({
                        "error": f"uv lock failed: {lock_result.stderr}"
                    }))
                    return
                
                # Step 3: Read generated script and extract PEP 723 metadata block
                with open(temp_py_file, 'r') as f:
                    script_content = f.read()
                
                # Extract only the PEP 723 metadata block using canonical regex
                pep723_pattern = r'(?m)^# /// (?P<type>[a-zA-Z0-9-]+)$\s(?P<content>(^#(| .*)$\s)+)^# ///$'
                match = re.search(pep723_pattern, script_content)
                
                if not match:
                    self.set_status(500)
                    self.finish(json.dumps({
                        "error": "Failed to extract PEP 723 metadata from generated script"
                    }))
                    return
                
                # Reconstruct the metadata block
                metadata_type = match.group('type')
                metadata_content = match.group('content')
                initial_metadata = f"# /// {metadata_type}\n{metadata_content}# ///"
                
                lockfile_content = None
                if os.path.exists(temp_lock_file):
                    with open(temp_lock_file, 'r') as f:
                        lockfile_content = f.read()
                
                # Step 4: Return results
                self.finish(json.dumps({
                    "initial_metadata": initial_metadata,
                    "lockfile_content": lockfile_content
                }))
                
            finally:
                # Clean up temporary directory
                shutil.rmtree(temp_dir, ignore_errors=True)
                
        except Exception as e:
            self.set_status(500)
            self.finish(json.dumps({
                "error": f"Internal server error: {str(e)}"
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
            lockfile_content = data.get("lockfile_content")  # Can be None/null
            
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
            temp_lock_file = os.path.join(temp_dir, "script.py.lock")
            
            try:
                # Step 1: Write script metadata to temporary file
                with open(temp_py_file, 'w') as f:
                    f.write(script_metadata)
                
                # Step 2: Handle lockfile
                if lockfile_content:
                    # Write provided lockfile content
                    with open(temp_lock_file, 'w') as f:
                        f.write(lockfile_content)
                else:
                    # Generate lockfile using uv lock
                    lock_result = subprocess.run(
                        [uv_bin, "lock", "--script", temp_py_file],
                        capture_output=True,
                        text=True,
                        cwd=temp_dir
                    )
                    
                    if lock_result.returncode != 0:
                        self.set_status(500)
                        self.finish(json.dumps({
                            "error": f"uv lock failed: {lock_result.stderr}"
                        }))
                        return
                
                # Step 3: Run uv add command
                add_result = subprocess.run(
                    [uv_bin, "add", "--script", temp_py_file, dependency],
                    capture_output=True,
                    text=True,
                    cwd=temp_dir
                )
                
                if add_result.returncode != 0:
                    self.set_status(500)
                    self.finish(json.dumps({
                        "error": f"uv add failed: {add_result.stderr}"
                    }))
                    return
                
                # Step 4: Run uv tree command
                tree_result = subprocess.run(
                    [uv_bin, "tree", "--script", temp_py_file],
                    capture_output=True,
                    text=True,
                    cwd=temp_dir
                )
                
                tree_output = tree_result.stdout if tree_result.returncode == 0 else "Tree generation failed"
                
                # Step 5: Read updated metadata and lockfile
                with open(temp_py_file, 'r') as f:
                    updated_metadata = f.read()
                
                updated_lockfile = None
                if os.path.exists(temp_lock_file):
                    with open(temp_lock_file, 'r') as f:
                        updated_lockfile = f.read()
                
                # Step 6: Return results
                self.finish(json.dumps({
                    "updated_metadata": updated_metadata,
                    "lockfile_content": updated_lockfile,
                    "tree_output": tree_output
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
    
    # New get-tree handler
    get_tree_pattern = url_path_join(base_url, "pep723widget", "get-tree")
    
    # New initialize handler
    initialize_pattern = url_path_join(base_url, "pep723widget", "initialize")
    
    handlers = [
        (route_pattern, RouteHandler),
        (add_dependency_pattern, AddDependencyHandler),
        (get_tree_pattern, GetTreeHandler),
        (initialize_pattern, InitializeHandler)
    ]
    web_app.add_handlers(host_pattern, handlers)
