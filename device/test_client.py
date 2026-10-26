import io
import json
from pathlib import Path
import tempfile
import unittest
from client import Client, validate_image
from PIL import Image

def png(size=(480,800)):
    output=io.BytesIO()
    Image.new('RGB',size,'white').save(output,'PNG')
    return output.getvalue()

class DisplayTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.calls=[]
        self.image=png()
        self.revision='one'
        self.fail_ack=False
        self.pushes=[]
        self.client=Client('https://example.test','secret',self.temp.name,self.request,lambda image,rotation:self.pushes.append((image.size,rotation)))
    def request(self,path,body=None):
        self.calls.append((path,body))
        if path=='/device/manifest':
            return json.dumps({'revision':self.revision,'imageUrl':'/device/images/'+self.revision,'width':480,'height':800}).encode()
        if path=='/device/ack':
            if self.fail_ack: raise OSError('offline')
            return b'{}'
        return self.image
    def test_changed_only_and_ack_after_success(self):
        self.assertEqual(self.client.run(),'displayed')
        self.assertEqual(self.pushes,[((480,800),90)])
        self.assertEqual(self.client.run(),'unchanged')
        self.assertEqual(len(self.pushes),1)
        self.assertEqual(sum(path.startswith('/device/images') for path,_ in self.calls),1)
        self.assertEqual(self.calls[-1],('/device/ack',{'revision':'one'}))
    def test_failed_push_keeps_last_good_and_does_not_ack(self):
        self.client.run()
        prior=(Path(self.temp.name)/'last-good.png').read_bytes()
        self.revision='two'
        self.calls=[]
        def fail(image,rotation): raise OSError('panel disconnected')
        self.client.push=fail
        with self.assertRaises(OSError): self.client.run()
        self.assertEqual((Path(self.temp.name)/'last-good.png').read_bytes(),prior)
        self.assertFalse(any(path=='/device/ack' for path,_ in self.calls))
    def test_invalid_image_preserves_state(self):
        self.client.run()
        self.revision='two'
        self.image=png((800,480))
        with self.assertRaises(ValueError): self.client.run()
        self.assertEqual(json.loads((Path(self.temp.name)/'state.json').read_text())['revision'],'one')
    def test_failed_ack_retries_without_panel_refresh(self):
        self.fail_ack=True
        with self.assertRaises(OSError): self.client.run()
        self.fail_ack=False
        self.assertEqual(self.client.run(),'unchanged')
        self.assertEqual(len(self.pushes),1)
    def test_dry_run_never_pushes_or_acknowledges(self):
        self.assertEqual(self.client.run(dry_run=True),'validated')
        self.assertEqual(self.pushes,[])
        self.assertFalse((Path(self.temp.name)/'state.json').exists())
        self.assertFalse(any(path=='/device/ack' for path,_ in self.calls))
    def test_corrupt_png_rejected(self):
        with self.assertRaises(OSError): validate_image(b'not an image')

if __name__=='__main__': unittest.main()
